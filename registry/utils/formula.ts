import { readValue } from "@behaviors/implementation-utils.ts";
import { readMeasured } from "@interactable/measure.ts";

export interface FormulaResult {
  value: number | string;
}

interface EvalContext {
  readonly document?: Document;
  readonly source?: Element;
  readonly dryRun?: boolean;
}

type Value = number | string | boolean;

interface Operand {
  readonly value: Value;
  readonly origin: string;
  readonly literal?: boolean;
}

type Reason = "empty" | "not-a-number" | "division-by-zero" | "not-a-string" | "invalid-pattern";

export class FormulaError extends Error {
  readonly formula: string;
  readonly operator: string | undefined;
  readonly function: string | undefined;
  readonly operand: string | number | boolean;
  readonly origin: string;
  readonly selector: string | undefined;
  readonly element: Element | undefined;
  readonly reason: Reason;
  label?: string;

  constructor(opts: {
    formula: string;
    operator: string | undefined;
    function: string | undefined;
    operand: string | number | boolean;
    origin: string;
    selector: string | undefined;
    element: Element | undefined;
    reason: Reason;
  }) {
    const channel =
      opts.function !== undefined ? `${opts.function}()` : JSON.stringify(opts.operator);
    let message: string;
    if (opts.reason === "division-by-zero") {
      message = `formula ${JSON.stringify(opts.formula)}: ${channel} divided by zero from ${opts.origin}`;
    } else if (opts.reason === "not-a-string") {
      message = `${channel} needs a string as its first argument; ${opts.origin} read as ${
        typeof opts.operand === "boolean" ? "a boolean" : "a number"
      } — see the .value rule`;
    } else if (opts.reason === "invalid-pattern") {
      message = `${channel} got an invalid pattern ${JSON.stringify(opts.operand)}`;
    } else {
      const reason = opts.reason === "empty" ? "empty" : "not a number";
      message = `formula ${JSON.stringify(opts.formula)}: ${channel} got ${JSON.stringify(opts.operand)} from ${opts.origin} (${reason})`;
    }
    super(message);
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

export function parseFormula(source: string): void {
  new Formula(source, { dryRun: true }).evaluate();
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
                requireNumber(node, operatorMeta(this.source, op), this.context.dryRun) +
                requireNumber(rhs, operatorMeta(this.source, op), this.context.dryRun),
              origin: this.source.slice(start, this.pos).trim(),
            };
      } else {
        node = {
          value:
            requireNumber(node, operatorMeta(this.source, op), this.context.dryRun) -
            requireNumber(rhs, operatorMeta(this.source, op), this.context.dryRun),
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
      const left = requireNumber(node, operatorMeta(this.source, op), this.context.dryRun);
      const right = requireNumber(rhs, operatorMeta(this.source, op), this.context.dryRun);
      if (op === "/" && right === 0 && this.context.dryRun !== true) {
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
        value: -requireNumber(operand, operatorMeta(this.source, "unary -"), this.context.dryRun),
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
    } else if (ch === "#" || (ch !== undefined && /[A-Za-z_$]/.test(ch) && this.isThisKeyword())) {
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

  private isThisKeyword(): boolean {
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos]!)) this.pos++;
    const name = this.source.slice(start, this.pos);
    if (name !== "this") {
      this.pos = start;
      return false;
    }
    this.skipSpace();
    const call = this.source[this.pos] === "(";
    this.pos = start;
    return !call;
  }

  private parseReference(): Value {
    let display: string;
    let id: string | undefined;
    if (this.source[this.pos] === "#") {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
      id = this.source.slice(start, this.pos);
      if (id === "") throw new Error("empty # reference");
      display = `#${id}`;
    } else {
      const start = this.pos;
      while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos]!)) this.pos++;
      display = this.source.slice(start, this.pos);
    }
    this.skipSpace();
    if (this.source[this.pos] !== ".") throw new Error(`reference ${display} needs .value, .checked, .min, .max, .step, .height or .width`);
    this.pos++;
    const propStart = this.pos;
    while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
    const prop = this.source.slice(propStart, this.pos);
    if (this.context.dryRun === true) {
      if (
        prop !== "value" &&
        prop !== "checked" &&
        prop !== "min" &&
        prop !== "max" &&
        prop !== "step" &&
        prop !== "height" &&
        prop !== "width"
      ) {
        throw new Error(`reference ${display} needs .value, .checked, .min, .max, .step, .height or .width`);
      }
      return 0;
    }
    const target =
      id !== undefined
        ? (this.context.document !== undefined ? this.context.document.getElementById(id) : null)
        : this.context.source;
    if (target === undefined) {
      throw new Error(`formula ${JSON.stringify(this.source)}: this has no element here`);
    }
    if (target === null) {
      throw new Error(`formula ${JSON.stringify(this.source)}: ${display} not found`);
    }
    if (prop === "value") return readValue(target);
    if (prop === "checked") return readValue(target, "checked");
    if (prop === "min" || prop === "max" || prop === "step") return readValue(target, prop);
    if (prop === "height") return readMeasured(target, "height");
    if (prop === "width") return readMeasured(target, "width");
    throw new Error(`reference ${display} needs .value, .checked, .min, .max, .step, .height or .width`);
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
        if (next === quote || next === "\\") {
          out += next;
          this.pos += 2;
          continue;
        }
        out += ch;
        this.pos++;
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
      return Math.min(...args.map((arg) => requireNumber(arg, functionMeta(formula, name), context.dryRun)));
    }
    case "max": {
      if (args.length < 1) throw new Error("max() needs at least one argument");
      return Math.max(...args.map((arg) => requireNumber(arg, functionMeta(formula, name), context.dryRun)));
    }
    case "floor":
      requireArity(name, args.length, 1);
      return Math.floor(requireNumber(args[0]!, functionMeta(formula, name), context.dryRun));
    case "ceil":
      requireArity(name, args.length, 1);
      return Math.ceil(requireNumber(args[0]!, functionMeta(formula, name), context.dryRun));
    case "round":
      requireArity(name, args.length, 1);
      return Math.round(requireNumber(args[0]!, functionMeta(formula, name), context.dryRun));
    case "sum":
      requireArity(name, args.length, 1);
      return sum(selectorArg(args[0]!.value, context.dryRun), formula, context);
    case "count":
      requireArity(name, args.length, 1);
      return count(selectorArg(args[0]!.value, context.dryRun), context);
    case "replace": {
      requireArity(name, args.length, 3);
      const meta = functionMeta(formula, name);
      const source = requireString(args[0]!, meta, context.dryRun);
      const pattern = String(args[1]!.value);
      const replacement = String(args[2]!.value);
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch {
        throw new FormulaError({ ...meta, operand: pattern, origin: args[1]!.origin, reason: "invalid-pattern" });
      }
      return source.replace(regex, replacement);
    }
    default:
      throw new Error(`unknown function ${name}()`);
  }
}

function requireArity(name: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`${name}() takes ${expected} argument${expected === 1 ? "" : "s"}`);
}

function selectorArg(value: Value, dryRun?: boolean): string {
  if (typeof value !== "string") {
    if (dryRun === true) return "";
    throw new Error("sum()/count() need a selector string");
  }
  return value;
}

function sum(selector: string, formula: string, context: EvalContext): number {
  if (context.dryRun === true) return 0;
  let total = 0;
  const matches = Array.from(context.document!.querySelectorAll(selector));
  matches.forEach((element, index) => {
    total += requireNumber(
      { value: readValue(element), origin: element.id !== "" ? `#${element.id}` : `match ${index + 1}` },
      functionMeta(formula, "sum", selector, element),
      context.dryRun,
    );
  });
  return total;
}

function count(selector: string, context: EvalContext): number {
  if (context.dryRun === true) return 0;
  return context.document!.querySelectorAll(selector).length;
}

function requireNumber(operand: Operand, meta: Meta, dryRun?: boolean): number {
  if (dryRun === true) return 0;
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

function requireString(operand: Operand, meta: Meta, dryRun?: boolean): string {
  if (dryRun === true) return "";
  const value = operand.value;
  if (typeof value === "string") return value;
  throw new FormulaError({
    ...meta,
    operand: value,
    origin: operand.origin,
    reason: "not-a-string",
  });
}

function toResult(value: Value): FormulaResult {
  if (typeof value === "number") return { value };
  if (typeof value === "string") return { value };
  return { value: String(value) };
}