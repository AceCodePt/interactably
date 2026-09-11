import { defineImplementation } from "../_implementation-definition.ts";

export const dirtyable = defineImplementation(
  "dirtyable",
  {
    tags: ["input", "textarea", "select", "output"],
    verbs: { markClean: "undefined" },
  },
  (el) => {
    let baseline = el.value;
    const render = (): void => {
      el.classList.toggle("is-dirty", el.value !== baseline);
    };
    render();
    return {
      onInput: render,
      markClean: () => {
        baseline = el.value;
        render();
      },
    };
  },
);