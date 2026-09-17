import { readValue } from "@behaviors/implementation-utils.ts";
import { readMeasured } from "@interactable/measure.ts";

export interface FormulaResult {
  value: number | string;
}

interface EvalContext {
  readonly document: Document;
}

type Value = number | string | boolean;

interface Operand {
  readonly value: Value;
  readonly origin: string;
  readonly literal?: boolean;
}

type Reason = "empty" | "not-a-number" | "division-by-zero";

export class FormulaError extends Error {
  readonly formula: string;
  readonly operator: string | undefined;
  readonly function: string | undefined;
  readonly operand: string | number;
  readonly origin: string;
  readonly selector: string | undefined;
  readonly element: Element | undefined;
  readonly reason: Reason;

  constructor(opts: {
    formula: string;
    operator: string | undefined;
    function: string | undefined;
    operand: string | number;
    origin: string;
    selector: string | undefined;
    element: Element | undefined;
    reason: Reason;
  }) {
    const channel =
      opts.function !== undefined ? `${opts.function}()` : JSON.stringify(opts.operator);
    const reason = opts.reason === "empty" ? "empty" : "not a number";
    super(
      opts.reason === "division-by-zero"
        ? `formula ${JSON.stringify(opts.formula)}: ${channel} divided by zero from ${opts.origin}`
        : `formula ${JSON.stringify(opts.formula)}: ${channel} got ${JSON.stringify(opts.operand)} from ${opts.origin} (${reason})`,
    );
    this.name = "FormulaError";
    this.formula = opts.formula;
    this.operator = opts.operator;
    this.function = opts.function;
    this.operand = opts.operand;
    this.origin = opts.origin;
    this.selector = opts.selector;
    this.element = opts.element;
    this.reason = opts.reason;
  }
}

interface Meta {
  formula: string;
  operator: string | undefined;
  function: string | undefined;
  selector: string | undefined;
  element: Element | undefined;
}

function operatorMeta(formula: string, operator: string): Meta {
  return { formula, operator, function: undefined, selector: undefined, element: undefined };
}

function functionMeta(formula: string, name: string, selector?: string, element?: Element): Meta {
  return { formula, operator: undefined, function: name, selector, element };
}

export function evaluateFormula(source: string, context: EvalContext = { document }): FormulaResult {
  return toResult(new Formula(source, context).evaluate());
}

class Formula {
  private readonly source: string;
  private readonly context: EvalContext;
  private pos = 0;

  constructor(source: string, context: EvalContext) {
    this.source = source;
    this.context = context;
  }

  evaluate(): Value {
    const node = this.parseExpression();
    this.skipSpace();
    if (this.pos < this.source.length) throw new Error(`unexpected "${this.source[this.pos] ?? ""}"`);
    return node.value;
  }

  private parseExpression(): Operand {
    this.skipSpace();
    const start = this.pos;
    let node = this.parseTerm();
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "+" && op !== "-") return node;
      this.pos++;
      const rhs = this.parseTerm();
      if (op === "+") {
        const nodeValue = node.value;
        const rhsValue = rhs.value;
        const nodeString = typeof nodeValue === "string";
        const rhsString = typeof rhsValue === "string";
        const joining =
          (node.literal === true && nodeString) ||
          (rhs.literal === true && rhsString) ||
          ((nodeString || rhsString) && nodeValue !== "" && rhsValue !== "");
        node = joining
          ? { value: String(nodeValue) + String(rhsValue), origin: this.source.slice(start, this.pos).trim() }
          : {
              value:
                requireNumber(node, operatorMeta(this.source, op)) +
                requireNumber(rhs, operatorMeta(this.source, op)),
              origin: this.source.slice(start, this.pos).trim(),
            };
      } else {
        node = {
          value:
            requireNumber(node, operatorMeta(this.source, op)) -
            requireNumber(rhs, operatorMeta(this.source, op)),
          origin: this.source.slice(start, this.pos).trim(),
        };
      }
    }
  }

  private parseTerm(): Operand {
    this.skipSpace();
    const start = this.pos;
    let node = this.parseFactor();
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "*" && op !== "/") return node;
      this.pos++;
      const rhs = this.parseFactor();
      const left = requireNumber(node, operatorMeta(this.source, op));
      const right = requireNumber(rhs, operatorMeta(this.source, op));
      if (op === "/" && right === 0) {
        throw new FormulaError({
          ...operatorMeta(this.source, op),
          operand: 0,
          origin: rhs.literal === true ? "(literal)" : rhs.origin,
          reason: "division-by-zero",
        });
      }
      node = {
        value: op === "*" ? left * right : left / right,
        origin: this.source.slice(start, this.pos).trim(),
      };
    }
  }

  private parseFactor(): Operand {
    this.skipSpace();
    if (this.source[this.pos] === "-") {
      this.pos++;
      const operandStart = this.pos;
      const operand = this.parseFactor();
      return {
        value: -requireNumber(operand, operatorMeta(this.source, "unary -")),
        origin: this.source.slice(operandStart, this.pos).trim(),
        ...(operand.literal === true ? { literal: true as const } : {}),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Operand {
    this.skipSpace();
    const start = this.pos;
    const ch = this.source[this.pos];
    let value: Value;
    let literal = false;
    if (ch === "(") {
      this.pos++;
      value = this.parseExpression().value;
      this.skipSpace();
      if (this.source[this.pos] !== ")") throw new Error("missing )");
      this.pos++;
    } else if (ch === "#") {
      value = this.parseReference();
    } else if (ch === "'" || ch === '"') {
      value = this.parseString(ch);
      literal = true;
    } else if (ch !== undefined && /[0-9.]/.test(ch)) {
      value = this.parseNumber();
      literal = true;
    } else if (ch !== undefined && /[A-Za-z_$]/.test(ch)) {
      value = this.parseCall();
    } else {
      throw new Error(`unexpected "${ch ?? "end of formula"}"`);
    }
    return { value, origin: this.source.slice(start, this.pos).trim(), literal };
  }

  private parseReference(): Value {
    this.pos++;
    const start = this.pos;
    while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
    const id = this.source.slice(start, this.pos);
    if (id === "") throw new Error("empty # reference");
    this.skipSpace();
    if (this.source[this.pos] !== ".") throw new Error(`reference #${id} needs .value, .checked, .height or .width`);
    this.pos++;
    const propStart = this.pos;
    while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
    const prop = this.source.slice(propStart, this.pos);
    const element = this.context.document.getElementById(id);
    if (element === null) {
      throw new Error(`formula ${JSON.stringify(this.source)}: #${id} not found`);
    }
    if (prop === "value") return readValue(element);
    if (prop === "checked") return (element as unknown as { checked?: unknown }).checked === true;
    if (prop === "height") return readMeasured(element, "height");
    if (prop === "width") return readMeasured(element, "width");
    throw new Error(`reference #${id} needs .value, .checked, .height or .width`);
  }

  private parseCall(): Value {
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos]!)) this.pos++;
    const name = this.source.slice(start, this.pos);
    this.skipSpace();
    if (this.source[this.pos] !== "(") throw new Error(`unknown token "${name}"`);
    this.pos++;
    return applyFunction(name, this.parseArguments(), this.source, this.context);
  }

  private parseArguments(): Operand[] {
    const args: Operand[] = [];
    this.skipSpace();
    if (this.source[this.pos] === ")") {
      this.pos++;
      return args;
    }
    for (;;) {
      args.push(this.parseExpression());
      this.skipSpace();
      const next = this.source[this.pos];
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === ")") {
        this.pos++;
        return args;
      }
      throw new Error("expected , or ) in arguments");
    }
  }

  private parseString(quote: string): string {
    this.pos++;
    let out = "";
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos]!;
      if (ch === "\\") {
        const next = this.source[this.pos + 1];
        if (next === undefined) break;
        out += next;
        this.pos += 2;
        continue;
      }
      if (ch === quote) {
        this.pos++;
        return out;
      }
      out += ch;
      this.pos++;
    }
    throw new Error("unterminated string");
  }

  private parseNumber(): number {
    const start = this.pos;
    while (this.pos < this.source.length && /[0-9.]/.test(this.source[this.pos]!)) this.pos++;
    const text = this.source.slice(start, this.pos);
    const number = Number(text);
    if (Number.isNaN(number)) throw new Error(`invalid number "${text}"`);
    return number;
  }

  private skipSpace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos]!)) this.pos++;
  }
}

function applyFunction(name: string, args: Operand[], formula: string, context: EvalContext): Value {
  switch (name) {
    case "min": {
      if (args.length < 1) throw new Error("min() needs at least one argument");
      return Math.min(...args.map((arg) => requireNumber(arg, functionMeta(formula, name))));
    }
    case "max": {
      if (args.length < 1) throw new Error("max() needs at least one argument");
      return Math.max(...args.map((arg) => requireNumber(arg, functionMeta(formula, name))));
    }
    case "floor":
      requireArity(name, args.length, 1);
      return Math.floor(requireNumber(args[0]!, functionMeta(formula, name)));
    case "ceil":
      requireArity(name, args.length, 1);
      return Math.ceil(requireNumber(args[0]!, functionMeta(formula, name)));
    case "round":
      requireArity(name, args.length, 1);
      return Math.round(requireNumber(args[0]!, functionMeta(formula, name)));
    case "sum":
      requireArity(name, args.length, 1);
      return sum(selectorArg(args[0]!.value), formula, context);
    case "count":
      requireArity(name, args.length, 1);
      return count(selectorArg(args[0]!.value), context);
    default:
      throw new Error(`unknown function ${name}()`);
  }
}

function requireArity(name: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`${name}() takes ${expected} argument${expected === 1 ? "" : "s"}`);
}

function selectorArg(value: Value): string {
  if (typeof value !== "string") throw new Error("sum()/count() need a selector string");
  return value;
}

function sum(selector: string, formula: string, context: EvalContext): number {
  let total = 0;
  const matches = Array.from(context.document.querySelectorAll(selector));
  matches.forEach((element, index) => {
    total += requireNumber(
      { value: readValue(element), origin: element.id !== "" ? `#${element.id}` : `match ${index + 1}` },
      functionMeta(formula, "sum", selector, element),
    );
  });
  return total;
}

function count(selector: string, context: EvalContext): number {
  return context.document.querySelectorAll(selector).length;
}

function requireNumber(operand: Operand, meta: Meta): number {
  const value = operand.value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      throw new FormulaError({ ...meta, operand: "NaN", origin: operand.origin, reason: "not-a-number" });
    }
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new FormulaError({
    ...meta,
    operand: String(value),
    origin: operand.origin,
    reason: value === "" ? "empty" : "not-a-number",
  });
}

function toResult(value: Value): FormulaResult {
  if (typeof value === "number") return { value };
  if (typeof value === "string") return { value };
  return { value: String(value) };
}