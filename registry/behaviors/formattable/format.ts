export type OptionValue = string | number | boolean;
export type Options = Record<string, OptionValue>;

export function isOptions(value: unknown): value is Options {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOptions(source: string): Options {
  const parser = new ObjectParser(source);
  const options = parser.parse();
  parser.skipSpace();
  if (!parser.atEnd()) throw new Error(`unexpected "${parser.peek()}"`);
  return options;
}

export function formatValue(raw: string, options: Options): string {
  const locale = typeof options["locale"] === "string" ? options["locale"] : "en-US";
  const type = options["type"] === "date" ? "date" : "number";
  const intlOptions: Record<string, OptionValue> = {};
  for (const [key, option] of Object.entries(options)) {
    if (key !== "locale" && key !== "type") intlOptions[key] = option;
  }
  if (type === "date") {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat(locale, intlOptions as unknown as Intl.DateTimeFormatOptions).format(date);
  }
  const number = Number(raw);
  if (Number.isNaN(number)) return raw;
  return new Intl.NumberFormat(locale, intlOptions as unknown as Intl.NumberFormatOptions).format(number);
}

class ObjectParser {
  private readonly source: string;
  private pos = 0;

  constructor(source: string) {
    this.source = source;
  }

  atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  peek(): string {
    return this.source[this.pos] ?? "";
  }

  skipSpace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos]!)) this.pos++;
  }

  parse(): Options {
    this.skipSpace();
    if (this.source[this.pos] !== "{") throw new Error(`expected "{"`);
    this.pos++;
    const options: Options = {};
    this.skipSpace();
    if (this.source[this.pos] === "}") {
      this.pos++;
      return options;
    }
    for (;;) {
      this.skipSpace();
      const key = this.parseKey();
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

  private parseKey(): string {
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
}