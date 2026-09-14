import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { valueOf, writeValue } from "@behaviors/implementation-utils.ts";

export const compute = defineImplementation<
  undefined,
  {
    formula: "string";
    precision: "number | undefined";
    "invalid-value": "string | undefined";
  },
  {},
  { compute: "undefined" }
>(
  "compute",
  {
    config: {
      formula: "string",
      precision: "number | undefined",
      "invalid-value": "string | undefined",
    },
    verbs: { compute: "undefined" },
  },
  (el, attrs) => {
    const calculate = (): void => {
      const formula = attrs.formula;
      if (formula === undefined) return;
      const parser = new Formula(formula);
      const context = new Map<string, number>();
      for (const id of parser.dependencies()) {
        const dep = document.getElementById(id);
        context.set(id, dep === null ? 0 : valueOf(dep));
      }
      let result: number;
      try {
        result = parser.evaluate(context);
      } catch {
        writeValue(el, attrs["invalid-value"] ?? "Error");
        return;
      }
      if (attrs.precision !== undefined) result = Number(result.toFixed(attrs.precision));
      writeValue(el, String(result));
      el.dataset["value"] = String(result);
    };
    return {
      compute: () => calculate(),
      connectedCallback: () => {
        if (attrs.formula !== undefined) calculate();
      },
    };
  },
);

class Formula {
  private readonly source: string;
  private pos = 0;

  constructor(source: string) {
    this.source = source;
  }

  dependencies(): string[] {
    const ids = new Set<string>();
    for (const match of this.source.matchAll(/#([\w-]+)/g)) {
      if (match[1] !== undefined) ids.add(match[1]);
    }
    return [...ids];
  }

  evaluate(context: Map<string, number>): number {
    const value = this.parseExpression(context);
    this.skipSpace();
    if (this.pos < this.source.length) throw new Error(`unexpected "${this.source[this.pos]}"`);
    return value;
  }

  private parseExpression(context: Map<string, number>): number {
    let value = this.parseTerm(context);
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "+" && op !== "-") return value;
      this.pos++;
      const rhs = this.parseTerm(context);
      value = op === "+" ? value + rhs : value - rhs;
    }
  }

  private parseTerm(context: Map<string, number>): number {
    let value = this.parseFactor(context);
    for (;;) {
      this.skipSpace();
      const op = this.source[this.pos];
      if (op !== "*" && op !== "/") return value;
      this.pos++;
      const rhs = this.parseFactor(context);
      value = op === "*" ? value * rhs : rhs === 0 ? 0 : value / rhs;
    }
  }

  private parseFactor(context: Map<string, number>): number {
    this.skipSpace();
    if (this.source[this.pos] === "-") {
      this.pos++;
      return -this.parseFactor(context);
    }
    return this.parsePrimary(context);
  }

  private parsePrimary(context: Map<string, number>): number {
    this.skipSpace();
    const ch = this.source[this.pos];
    if (ch === "(") {
      this.pos++;
      const value = this.parseExpression(context);
      this.skipSpace();
      if (this.source[this.pos] !== ")") throw new Error("missing )");
      this.pos++;
      return value;
    }
    if (ch === "#") {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.source.length && /[\w-]/.test(this.source[this.pos]!)) this.pos++;
      const id = this.source.slice(start, this.pos);
      if (id === "") throw new Error("empty # reference");
      return context.get(id) ?? 0;
    }
    if (ch !== undefined && /[A-Za-z]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.source.length && /[A-Za-z]/.test(this.source[this.pos]!)) this.pos++;
      const name = this.source.slice(start, this.pos);
      this.skipSpace();
      if (this.source[this.pos] !== "(") throw new Error(`unknown token "${name}"`);
      this.pos++;
      const args: number[] = [];
      this.skipSpace();
      if (this.source[this.pos] === ")") {
        this.pos++;
      } else {
        for (;;) {
          args.push(this.parseExpression(context));
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

  private skipSpace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos]!)) this.pos++;
  }
}

function applyFunction(name: string, args: number[]): number {
  switch (name) {
    case "min":
      if (args.length < 1) throw new Error("min() needs at least one argument");
      return Math.min(...args);
    case "max":
      if (args.length < 1) throw new Error("max() needs at least one argument");
      return Math.max(...args);
    case "floor":
      if (args.length !== 1) throw new Error("floor() takes one argument");
      return Math.floor(args[0]!);
    case "ceil":
      if (args.length !== 1) throw new Error("ceil() takes one argument");
      return Math.ceil(args[0]!);
    case "round":
      if (args.length !== 1) throw new Error("round() takes one argument");
      return Math.round(args[0]!);
    default:
      throw new Error(`unknown function ${name}()`);
  }
}