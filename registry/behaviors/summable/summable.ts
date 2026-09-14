import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { valueOf } from "@behaviors/implementation-utils.ts";

export const summable = defineImplementation(
  "summable",
  {
    tags: ["output", "span", "td"],
    config: { precision: "number | undefined" },
    verbs: { sum: { root: HTMLElement, select: "string" } },
  },
  (el, attrs) => ({
    sum: (_e, { root, select }) => {
      let total = 0;
      for (const node of root.querySelectorAll(select)) total += valueOf(node);
      el.textContent = total.toFixed(attrs.precision ?? 2);
      el.dataset["value"] = String(total);
    },
  }),
);