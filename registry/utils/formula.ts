import { valueOf as valueOfElement } from "@behaviors/implementation-utils.ts";

export interface FormulaResult {
  text: string;
  value: number | null;
}

export function evaluateFormula(source: string): FormulaResult {
  const parser = new FormulaParser(source);
  const value = parser.parseExpression();
  parser.skipSpace();
  if (parser.pos < source.length) throw new Error(`unexpected "${source[parser.pos]}"`);
  return toResult(value);
}

class Formatted {
  readonly text: string;
  readonly value: number | null;

  constructor(text: string, value: number | null) {
    this.text = text;
    this.value = value;
  }
}

interface ObjectLiteral {
  [key: string]: Value;
}

type Value = number | string | boolean | Formatted | ObjectLiteral;

function toResult(value: Value): FormulaResult {
  if (value instanceof Formatted) return { text: value.text, value: value.value };
  if (typeof value === "number") return { text: String(value), value };
  if (typeof value === "string") return { text: value, value: null };
  if (typeof value === "boolean") return { text: String(value), value: null };
  throw new Error("formula must evaluate to a scalar or formatted value");
}

class FormulaParser {
  pos = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parseExpression(): Value {
    let value = this.parseTerm();
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "+" && op !== "-") return value;
      this.pos++;
      const rhs = this.parseTerm();
      const a = toNumber(value);
      const b = toNumber(rhs);
      value = op === "+" ? a + b : a - b;
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
      const a = toNumber(value);
      const b = toNumber(rhs);
      value = op === "*" ? a * b : b === 0 ? 0 : a / b;
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
    if (ch === "{") {
      this.pos++;
      return this.parseObject();
    }
    if (ch === "#") {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
      const id = this.source.slice(start, this.pos);
      if (id === "") throw new Error("empty # reference");
      return rawReference(id);
    }
    if (ch === "'") return this.parseString();
    if (ch !== undefined && /[A-Za-z]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
      const name = this.source.slice(start, this.pos);
      this.skipSpace();
      if (this.source[this.pos] !== "(") throw new Error(`unknown token "${name}"`);
      this.pos++;
      const args: Value[] = [];
      this.skipSpace();
      if (this.source[this.pos] === ")") {
        this.pos++;
      } else {
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
            break;
          }
          throw new Error(`expected , or ) in ${name}()`);
        }
      }
      return applyFunction(name, args);
    }
    if (ch !== undefined && /[0-9.]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.source.length && /[0-9.]/.test(this.source[this.pos]!)) this.pos++;
      const number = Number(this.source.slice(start, this.pos));
      if (Number.isNaN(number)) throw new Error(`invalid number "${this.source.slice(start, this.pos)}"`);
      return number;
    }
    throw new Error(`unexpected "${ch ?? "end of formula"}"`);
  }

  private parseString(): string {
    this.pos++;
    let out = "";
    for (;;) {
      if (this.pos >= this.source.length) throw new Error("unterminated string");
      const ch = this.source[this.pos]!;
      if (ch === "'") {
        this.pos++;
        return out;
      }
      if (ch === "\\" && this.pos + 1 < this.source.length) {
        this.pos++;
        out += this.source[this.pos]!;
        this.pos++;
        continue;
      }
      out += ch;
      this.pos++;
    }
  }

  private parseObject(): ObjectLiteral {
    const record: ObjectLiteral = {};
    this.skipSpace();
    if (this.source[this.pos] === "}") {
      this.pos++;
      return record;
    }
    for (;;) {
      this.skipSpace();
      const key = this.parseKey();
      this.skipSpace();
      if (this.source[this.pos] !== ":") throw new Error(`expected : after "${key}"`);
      this.pos++;
      record[key] = this.parseScalar();
      this.skipSpace();
      const next = this.source[this.pos];
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "}") {
        this.pos++;
        return record;
      }
      throw new Error("expected , or } in object literal");
    }
  }

  private parseKey(): string {
    const start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_]/.test(this.source[this.pos]!)) this.pos++;
    const key = this.source.slice(start, this.pos);
    if (key === "") throw new Error("empty object key");
    return key;
  }

  private parseScalar(): Value {
    this.skipSpace();
    const ch = this.source[this.pos];
    if (ch === "'") return this.parseString();
    if (ch !== undefined && /[0-9.]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.source.length && /[0-9.]/.test(this.source[this.pos]!)) this.pos++;
      return Number(this.source.slice(start, this.pos));
    }
    if (ch !== undefined && /[A-Za-z]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
      const word = this.source.slice(start, this.pos);
      if (word === "true") return true;
      if (word === "false") return false;
      throw new Error(`unknown value "${word}"`);
    }
    throw new Error("object values must be strings, numbers or booleans");
  }

  skipSpace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos]!)) this.pos++;
  }
}

function rawReference(id: string): string {
  const el = document.getElementById(id);
  if (el === null) return "";
  return "value" in el ? (el as { value: string }).value : (el.textContent ?? "");
}

function toNumber(value: Value): number {
  if (value instanceof Formatted) return Number(value.text);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error("expected a number");
}

function selectorOf(value: Value): string {
  if (typeof value === "string") return value;
  if (value instanceof Formatted) return value.text;
  throw new Error("expected a selector string");
}

function objectOf(value: Value): ObjectLiteral {
  if (typeof value === "object" && value !== null && !(value instanceof Formatted)) return value;
  throw new Error("format() options must be an object literal");
}

function scalarOf(value: Value): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Formatted) return value.text;
  throw new Error("format() options must be scalar values");
}

function scalarString(value: Value | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function rawText(value: Value): string {
  if (value instanceof Formatted) return value.text;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function applyFunction(name: string, args: Value[]): Value {
  switch (name) {
    case "min":
      if (args.length < 1) throw new Error("min() needs at least one argument");
      return Math.min(...args.map(toNumber));
    case "max":
      if (args.length < 1) throw new Error("max() needs at least one argument");
      return Math.max(...args.map(toNumber));
    case "floor":
      if (args.length !== 1) throw new Error("floor() takes one argument");
      return Math.floor(toNumber(args[0]!));
    case "ceil":
      if (args.length !== 1) throw new Error("ceil() takes one argument");
      return Math.ceil(toNumber(args[0]!));
    case "round":
      if (args.length !== 1) throw new Error("round() takes one argument");
      return Math.round(toNumber(args[0]!));
    case "sum": {
      if (args.length !== 1) throw new Error("sum() takes one selector argument");
      const selector = selectorOf(args[0]!);
      let total = 0;
      for (const node of document.querySelectorAll(selector)) total += valueOfElement(node);
      return total;
    }
    case "count": {
      if (args.length !== 1) throw new Error("count() takes one selector argument");
      return document.querySelectorAll(selectorOf(args[0]!)).length;
    }
    case "format":
      if (args.length < 1 || args.length > 2) throw new Error("format() takes a value and optional options");
      return formatValue(args[0]!, args[1]);
    default:
      throw new Error(`unknown function ${name}()`);
  }
}

function formatValue(value: Value, options: Value | undefined): Formatted {
  const record = options === undefined ? {} : objectOf(options);
  const locale = scalarString(record["locale"]) ?? "en-US";
  const type = scalarString(record["type"]) ?? "number";
  const intl: Record<string, unknown> = {};
  for (const [key, option] of Object.entries(record)) {
    if (key === "locale" || key === "type") continue;
    intl[key] = scalarOf(option);
  }
  if (type === "date") {
    const raw = rawText(value);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return new Formatted(raw, null);
    return new Formatted(new Intl.DateTimeFormat(locale, intl as Intl.DateTimeFormatOptions).format(date), null);
  }
  const number = toNumber(value);
  const text = new Intl.NumberFormat(locale, intl as Intl.NumberFormatOptions).format(
    type === "percent" ? number / 100 : number,
  );
  return new Formatted(text, number);
}