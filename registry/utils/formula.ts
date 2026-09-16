import { readValue, valueOf } from "@behaviors/implementation-utils.ts";

export interface FormulaResult {
  value: number | string;
}

interface EvalContext {
  readonly document: Document;
}

type Value = number | string | boolean;

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
    const value = this.parseExpression();
    this.skipSpace();
    if (this.pos < this.source.length) throw new Error(`unexpected "${this.source[this.pos] ?? ""}"`);
    return value;
  }

  private parseExpression(): Value {
    let value = this.parseTerm();
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "+" && op !== "-") return value;
      this.pos++;
      const rhs = this.parseTerm();
      if (op === "+") {
        value =
          typeof value === "string" || typeof rhs === "string"
            ? String(value) + String(rhs)
            : toNumber(value) + toNumber(rhs);
      } else {
        value = toNumber(value) - toNumber(rhs);
      }
    }
  }

  private parseTerm(): Value {
    let value = this.parseFactor();
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "*" && op !== "/") return value;
      this.pos++;
      const rhs = this.parseFactor();
      const left = toNumber(value);
      const right = toNumber(rhs);
      value = op === "*" ? left * right : right === 0 ? 0 : left / right;
    }
  }

  private parseFactor(): Value {
    this.skipSpace();
    if (this.source[this.pos] === "-") {
      this.pos++;
      return -toNumber(this.parseFactor());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Value {
    this.skipSpace();
    const ch = this.source[this.pos];
    if (ch === "(") {
      this.pos++;
      const value = this.parseExpression();
      this.skipSpace();
      if (this.source[this.pos] !== ")") throw new Error("missing )");
      this.pos++;
      return value;
    }
    if (ch === "#") return this.parseReference();
    if (ch === "'" || ch === '"') return this.parseString(ch);
    if (ch !== undefined && /[0-9.]/.test(ch)) return this.parseNumber();
    if (ch !== undefined && /[A-Za-z_$]/.test(ch)) return this.parseCall();
    throw new Error(`unexpected "${ch ?? "end of formula"}"`);
  }

  private parseReference(): Value {
    this.pos++;
    const start = this.pos;
    while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
    const id = this.source.slice(start, this.pos);
    if (id === "") throw new Error("empty # reference");
    this.skipSpace();
    if (this.source[this.pos] !== ".") throw new Error(`reference #${id} needs .value or .checked`);
    this.pos++;
    const propStart = this.pos;
    while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
    const prop = this.source.slice(propStart, this.pos);
    const element = this.context.document.getElementById(id);
    if (prop === "value") return element === null ? "" : readValue(element);
    if (prop === "checked") return element === null ? false : (element as unknown as { checked?: unknown }).checked === true;
    throw new Error(`reference #${id} needs .value or .checked`);
  }

  private parseCall(): Value {
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos]!)) this.pos++;
    const name = this.source.slice(start, this.pos);
    this.skipSpace();
    if (this.source[this.pos] !== "(") throw new Error(`unknown token "${name}"`);
    this.pos++;
    return applyFunction(name, this.parseArguments(), this.context);
  }

  private parseArguments(): Value[] {
    const args: Value[] = [];
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

function applyFunction(name: string, args: Value[], context: EvalContext): Value {
  switch (name) {
    case "min": {
      if (args.length < 1) throw new Error("min() needs at least one argument");
      return Math.min(...args.map(toNumber));
    }
    case "max": {
      if (args.length < 1) throw new Error("max() needs at least one argument");
      return Math.max(...args.map(toNumber));
    }
    case "floor":
      requireArity(name, args, 1);
      return Math.floor(toNumber(args[0]));
    case "ceil":
      requireArity(name, args, 1);
      return Math.ceil(toNumber(args[0]));
    case "round":
      requireArity(name, args, 1);
      return Math.round(toNumber(args[0]));
    case "sum":
      requireArity(name, args, 1);
      return sum(selectorArg(args[0]), context);
    case "count":
      requireArity(name, args, 1);
      return count(selectorArg(args[0]), context);
    default:
      throw new Error(`unknown function ${name}()`);
  }
}

function requireArity(name: string, args: Value[], count: number): void {
  if (args.length !== count) throw new Error(`${name}() takes ${count} argument${count === 1 ? "" : "s"}`);
}

function selectorArg(value: Value | undefined): string {
  if (typeof value !== "string") throw new Error("sum()/count() need a selector string");
  return value;
}

function sum(selector: string, context: EvalContext): number {
  let total = 0;
  for (const element of Array.from(context.document.querySelectorAll(selector))) total += valueOf(element);
  return total;
}

function count(selector: string, context: EvalContext): number {
  return context.document.querySelectorAll(selector).length;
}

function toNumber(value: Value | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value ? 1 : 0;
}

function toResult(value: Value): FormulaResult {
  if (typeof value === "number") return { value };
  if (typeof value === "string") return { value };
  return { value: String(value) };
}
