import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const listable = defineImplementation(
  "listable",
  {
    tags: ["ul", "ol", "tbody"],
    config: { "min-rows": "number | undefined" },
    verbs: {
      removeRow: HTMLElement,
      adopt: HTMLTemplateElement,
      clear: "undefined",
    },
  },
  (el, attrs) => {
    const minRows = (): number => attrs["min-rows"] ?? 0;
    return {
      removeRow: (_e, from) => {
        const row = rowOf(from, el);
        if (row !== null && el.children.length > minRows()) row.remove();
      },
      adopt: (_e, tpl) => el.append(tpl.content.cloneNode(true)),
      clear: () => {
        while (el.children.length > minRows()) el.lastElementChild!.remove();
      },
    };
  },
);

function rowOf(from: HTMLElement, container: Element): Element | null {
  let node: Element | null = from;
  while (node !== null && node !== container) {
    if (node.parentElement === container) return node;
    node = node.parentElement;
  }
  return null;
}