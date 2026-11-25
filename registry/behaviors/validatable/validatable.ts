import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const validatable = defineImplementation(
  "validatable",
  {
    tags: ["form", "input", "select", "textarea"],
    verbs: {
      reportValidity: "undefined",
      checkValidity: "undefined",
    },
    events: {
      valid: {},
      invalid: {},
    },
  },
  (el) => {
    const announce = (valid: boolean): void => {
      el.dispatchEvent(new ImplementationEvent(valid ? "valid" : "invalid"));
    };
    return {
      reportValidity: (e) => {
        const valid = el.reportValidity();
        announce(valid);
        if (!valid) e.preventDefault();
      },
      checkValidity: () => {
        announce(el.checkValidity());
      },
    };
  },
);
