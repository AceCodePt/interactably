import { defineImplementation } from "../_implementation-definition.ts";
import { valueOf } from "../implementation-utils.ts";

export const modifiable = defineImplementation(
  "modifiable",
  {
    tags: ["input", "textarea", "output", "select"],
    config: { step: "number | undefined" },
    verbs: {
      set: "string",
      inc: "number | undefined",
      dec: "number | undefined",
      clear: "undefined",
      reset: "undefined",
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
    return {
      set: (_e, v) => write(v),
      inc: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) + n)),
      dec: (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) - n)),
      clear: () => write(""),
      reset: () => write(el.getAttribute("value") ?? ""),
    };
  },
);

function hasValue(el: Element): el is Element & { value: string } {
  return "value" in el;
}