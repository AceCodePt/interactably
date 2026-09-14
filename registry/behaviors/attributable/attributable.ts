import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const attributable = defineImplementation(
  "attributable",
  {
    verbs: {
      setAttr: { name: "string", value: "string" },
      toggleAttr: "string",
      removeAttr: "string",
    },
  },
  (el) => ({
    setAttr: (_e, { name, value }) => el.setAttribute(name, value),
    toggleAttr: (_e, name) => el.toggleAttribute(name),
    removeAttr: (_e, name) => el.removeAttribute(name),
  }),
);