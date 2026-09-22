import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const classable = defineImplementation(
  "classable",
  {
    verbs: {
      add: "string",
      remove: "string",
      toggle: "string",
    },
  },
  (el) => ({
    add: (_e, name) => el.classList.add(name),
    remove: (_e, name) => el.classList.remove(name),
    toggle: (_e, name) => el.classList.toggle(name),
  }),
);