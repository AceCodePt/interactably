import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { valueOf, writeValue } from "@behaviors/implementation-utils.ts";
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
    const bound = (k: "min" | "max"): number | undefined =>
      el instanceof HTMLInputElement && el[k] !== "" ? Number(el[k]) : undefined;
    const clamp = (n: number): number =>
      Math.min(bound("max") ?? Infinity, Math.max(bound("min") ?? -Infinity, n));
    const calculate = (): void => {
      const formula = attrs.formula;
      if (formula === undefined) return;
      let result: { text: string; value: number | null };
      try {
        result = evaluateFormula(formula);
      } catch {
        writeValue(el, attrs["invalid-value"] ?? "Error");
        return;
      }
      writeValue(el, result.text);
      if (result.value !== null) {
        el.dataset["value"] = String(result.value);
      } else {
        delete el.dataset["value"];
      }
    };
    return {
      set: (_e, v) => write(v),
      inc: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) + n)),
      dec: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) - n)),
      clear: () => write(""),
      reset: () => write(el.getAttribute("value") ?? ""),
      compute: () => calculate(),
      connectedCallback: () => {
        if (attrs.formula !== undefined) calculate();
      },
    };
  },
);

function hasValue(el: Element): el is Element & { value: string } {
  return "value" in el;
}