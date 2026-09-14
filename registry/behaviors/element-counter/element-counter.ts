import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { writeValue } from "@behaviors/implementation-utils.ts";

export const elementCounter = defineImplementation(
  "element-counter",
  {
    config: { root: "string | undefined", selector: "string | undefined" },
    verbs: { count: { root: HTMLElement, select: "string" } },
  },
  (el, attrs) => {
    const render = (count: number): void => {
      writeValue(el, String(count));
      el.dataset["value"] = String(count);
    };
    return {
      count: (_e, { root, select }) => render(root.querySelectorAll(select).length),
      connectedCallback: () => {
        if (attrs.root === undefined || attrs.selector === undefined) return;
        const root = document.getElementById(attrs.root);
        if (root !== null) render(root.querySelectorAll(attrs.selector).length);
      },
    };
  },
);