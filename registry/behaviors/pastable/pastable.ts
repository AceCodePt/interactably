import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const pastable = defineImplementation(
  "pastable",
  {
    tags: ["input", "textarea"],
    config: {},
    verbs: {},
    events: { pasted: { fields: { text: "string" } } },
  },
  (el) => ({
    onInput: (e: Event) => {
      if (e instanceof InputEvent && e.inputType.startsWith("insertFromPaste")) {
        el.dispatchEvent(new ImplementationEvent("pasted", { values: { text: el.value } }));
      }
    },
  }),
);