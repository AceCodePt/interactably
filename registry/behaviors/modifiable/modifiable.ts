import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { valueOf } from "@behaviors/implementation-utils.ts";
import { evaluateFormula } from "@utils/formula.ts";

export const modifiable = defineImplementation(
  "modifiable",
  {
    tags: ["input", "textarea", "output", "select"],
    config: {
      step: "number | undefined",
      formula: "string | undefined",
      "invalid-value": "string | undefined",
    },
    verbs: {
      set: "string",
      inc: "number | undefined",
      dec: "number | undefined",
      clear: "undefined",
      reset: "undefined",
      compute: "undefined",
      is: { op: "'==' | '!=' | '>' | '<' | '>=' | '<='", value: "number | string" },
    },
  },
  (el, attrs) => {
    const write = (v: string | number): void => {
      const text = String(v);
      const target: Element = el;
      if (hasValue(target)) {
        if (target.value === text) return;
        target.value = text;
      } else {
        if (target.textContent === text) return;
        target.textContent = text;
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const writeComputed = (text: string, value: number | null): void => {
      const target: Element = el;
      if (hasValue(target)) {
        target.value = text;
      } else {
        target.textContent = text;
      }
      if (value === null) el.removeAttribute("data-value");
      else el.setAttribute("data-value", String(value));
    };
    const compute = (): void => {
      const formula = attrs.formula;
      if (formula === undefined) return;
      try {
        const result = evaluateFormula(formula);
        writeComputed(result.text, result.value);
      } catch {
        writeComputed(attrs["invalid-value"] ?? "Error", null);
      }
    };
    const bound = (k: "min" | "max"): number | undefined =>
      el instanceof HTMLInputElement && el[k] !== "" ? Number(el[k]) : undefined;
    const clamp = (n: number): number =>
      Math.min(bound("max") ?? Infinity, Math.max(bound("min") ?? -Infinity, n));
    return {
      set: (_e, v) => write(v),
      inc: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) + n)),
      dec: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) - n)),
      clear: () => write(""),
      reset: () => write(el.getAttribute("value") ?? ""),
      compute: () => compute(),
      is: (e, { op, value }) => {
        if (!compare(rawValue(el), value, op)) e.preventDefault();
      },
      connectedCallback: () => compute(),
    };
  },
);

function hasValue(el: Element): el is Element & { value: string } {
  return "value" in el;
}

type Op = "==" | "!=" | ">" | "<" | ">=" | "<=";

function rawValue(el: HTMLElement): string {
  return "value" in el ? String((el as { value: unknown }).value) : el.textContent ?? "";
}

function compare(actual: string, expected: number | string, op: Op): boolean {
  switch (op) {
    case "==":
      return actual === String(expected);
    case "!=":
      return actual !== String(expected);
    case ">":
      return Number(actual) > Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
  }
}