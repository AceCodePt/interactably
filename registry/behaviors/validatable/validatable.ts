import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const validatable = defineImplementation(
  "validatable",
  {
    tags: ["form", "input", "select", "textarea"],
    verbs: { validate: "undefined" },
  },
  (el) => ({
    validate: (e) => {
      if (!el.reportValidity()) e.preventDefault();
    },
  }),
);
