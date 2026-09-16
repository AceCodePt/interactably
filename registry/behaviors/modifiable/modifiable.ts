import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { formatWrite, toNumber, valueOf } from "@behaviors/implementation-utils.ts";
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
      set: "string | number",
      inc: "string | number | undefined",
      dec: "string | number | undefined",
      clear: "undefined",
      reset: "undefined",
      compute: "undefined",
    },
  },
  (el, attrs) => {
    const write = (v: string | number): void => {
      const text = formatWrite(el, String(v));
      const target: Element = el;
      if (hasValue(target)) {
        if (target.value === text) return;
        target.value = text;
      } else {
        if (target.textContent === text) return;
        target.textContent = text;
      }
    };
    const compute = (): void => {
      const formula = attrs.formula;
      if (formula === undefined) return;
      try {
        write(String(evaluateFormula(formula).value));
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        write(attrs["invalid-value"] ?? "Error");
      }
    };
    const bound = (k: "min" | "max"): number | undefined =>
      el instanceof HTMLInputElement && el[k] !== "" ? Number(el[k]) : undefined;
    const clamp = (n: number): number =>
      Math.min(bound("max") ?? Infinity, Math.max(bound("min") ?? -Infinity, n));
    const numberArg = (verb: string, value: string | number): number => {
      const parsed = toNumber(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`${verb}() could not read a number from "${String(value)}"`);
      }
      return parsed;
    };
    return {
      set: (_e, v) => write(v),
      inc: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) + numberArg("inc", n))),
      dec: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) - numberArg("dec", n))),
      clear: () => write(""),
      reset: () => write(el.getAttribute("value") ?? ""),
      compute: () => compute(),
      connectedCallback: () => compute(),
    };
  },
);

function hasValue(el: Element): el is Element & { value: string } {
  return "value" in el;
}