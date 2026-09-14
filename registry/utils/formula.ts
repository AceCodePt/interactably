import { valueOf } from "@behaviors/implementation-utils.ts";

export interface FormulaResult {
  text: string;
  value: number | null;
}

interface EvalContext {
  readonly document: Document;
}

type OptionValue = string | number | boolean;
type Options = Record<string, OptionValue>;

class Formatted {
  readonly text: string;
  readonly value: number | null;

  constructor(text: string, value: number | null) {
    this.text = text;
    this.value = value;
  }
}

type Value = number | string | boolean | Options | Formatted;

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
      const left = toNumber(value);
      const right = toNumber(rhs);
      value = op === "+" ? left + right : left - right;
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
    if (ch === "{") return this.parseObject();
    if (ch !== undefined && /[0-9.]/.test(ch)) return this.parseNumber();
    if (ch !== undefined && /[A-Za-z_$]/.test(ch)) return this.parseCall();
    throw new Error(`unexpected "${ch ?? "end of formula"}"`);
  }

  private parseReference(): string {
    this.pos++;
    const start = this.pos;
    while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
    const id = this.source.slice(start, this.pos);
    if (id === "") throw new Error("empty # reference");
    const element = this.context.document.getElementById(id);
    return element === null ? "" : rawValue(element);
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

  private parseObject(): Options {
    this.pos++;
    const options: Options = {};
    this.skipSpace();
    if (this.source[this.pos] === "}") {
      this.pos++;
      return options;
    }
    for (;;) {
      this.skipSpace();
      const key = this.parseObjectKey();
      this.skipSpace();
      if (this.source[this.pos] !== ":") throw new Error(`expected ":" after option "${key}"`);
      this.pos++;
      options[key] = this.parseLiteral();
      this.skipSpace();
      const next = this.source[this.pos];
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "}") {
        this.pos++;
        return options;
      }
      throw new Error("expected , or } in options");
    }
  }

  private parseObjectKey(): string {
    this.skipSpace();
    const ch = this.source[this.pos];
    if (ch === "'" || ch === '"') return this.parseString(ch);
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos]!)) this.pos++;
    const key = this.source.slice(start, this.pos);
    if (key === "") throw new Error("expected an option name");
    return key;
  }

  private parseLiteral(): OptionValue {
    this.skipSpace();
    const ch = this.source[this.pos];
    if (ch === "'" || ch === '"') return this.parseString(ch);
    if (ch === "-") {
      this.pos++;
      return -this.parseNumber();
    }
    if (ch !== undefined && /[0-9.]/.test(ch)) return this.parseNumber();
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
    const word = this.source.slice(start, this.pos);
    if (word === "true") return true;
    if (word === "false") return false;
    throw new Error(`expected a literal value, got "${word}"`);
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
    case "format":
      requireArity(name, args, 2);
      return format(args[0], args[1]);
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

function format(value: Value | undefined, options: Value | undefined): Formatted {
  const settings = isOptions(options) ? options : {};
  const locale = typeof settings["locale"] === "string" ? settings["locale"] : "en-US";
  const type = settings["type"] === "date" ? "date" : "number";
  const intlOptions: Record<string, OptionValue> = {};
  for (const [key, option] of Object.entries(settings)) {
    if (key !== "locale" && key !== "type") intlOptions[key] = option;
  }
  if (type === "date") {
    const raw = toText(value);
    const date = new Date(raw);
    const text = Number.isNaN(date.getTime())
      ? raw
      : new Intl.DateTimeFormat(locale, intlOptions as unknown as Intl.DateTimeFormatOptions).format(date);
    return new Formatted(text, numericOrNull(value));
  }
  const number = toNumber(value);
  const text = new Intl.NumberFormat(locale, intlOptions as unknown as Intl.NumberFormatOptions).format(number);
  return new Formatted(text, Number.isFinite(number) ? number : null);
}

function rawValue(element: Element): string {
  const value = (element as unknown as { value?: unknown }).value;
  return typeof value === "string" ? value : element.textContent ?? "";
}

function isOptions(value: Value | undefined): value is Options {
  return typeof value === "object" && value !== null && !(value instanceof Formatted);
}

function toNumber(value: Value | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Formatted) return value.value ?? Number(value.text);
  return Number.NaN;
}

function toText(value: Value | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value instanceof Formatted) return value.text;
  return "";
}

function numericOrNull(value: Value | undefined): number | null {
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function toResult(value: Value): FormulaResult {
  if (typeof value === "number") return { text: String(value), value };
  if (typeof value === "string") return { text: value, value: null };
  if (typeof value === "boolean") return { text: String(value), value: null };
  if (value instanceof Formatted) return { text: value.text, value: value.value };
  return { text: "", value: null };
}
