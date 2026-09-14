import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { bindEvents } from "@behaviors/implementation-utils.ts";

export const noPropagate = defineImplementation(
  "no-propagate",
  {
    config: { events: "string | undefined" },
    verbs: {},
  },
  (el, attrs) => {
    const bound = bindEvents(el, () => attrs.events ?? "click", (e) => e.stopPropagation());
    return {
      attributeChangedCallback: (name: string): void => {
        if (name === "no-propagate-events") bound.update();
      },
      disconnectedCallback: () => bound.dispose(),
    };
  },
);