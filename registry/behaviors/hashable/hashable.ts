import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const hashable = defineImplementation(
  "hashable",
  {
    tags: undefined,
    config: {},
    verbs: { hash: "undefined" },
  },
  (el) => {
    let warned = false;
    return {
      hash: () => {
        if (el.id === "") {
          if (!warned) {
            warned = true;
            console.warn("[Interactable] hashable: the element has no id");
          }
          return;
        }
        const view = el.ownerDocument.defaultView;
        if (view === null) return;
        const next = `#${el.id}`;
        if (view.location.hash === next) return;
        view.history.replaceState(view.history.state, "", next);
      },
    };
  },
);