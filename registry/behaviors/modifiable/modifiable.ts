import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { formatWrite } from "@behaviors/implementation-utils.ts";

export const modifiable = defineImplementation(
  "modifiable",
  {
    tags: ["input", "textarea", "output", "select"],
    verbs: {
      set: "string | number",
      clear: "undefined",
      reset: "undefined",
    },
  },
  (el) => {
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
    return {
      set: (_e, v) => write(v),
      clear: () => write(""),
      reset: () => {
        if (el instanceof HTMLSelectElement) {
          for (const option of Array.from(el.options)) option.selected = option.defaultSelected;
          return;
        }
        write(el.defaultValue);
      },
    };
  },
);

function hasValue(el: Element): el is Element & { value: string } {
  return "value" in el;
}