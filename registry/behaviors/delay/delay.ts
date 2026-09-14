import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const delay = defineImplementation(
  "delay",
  {
    verbs: { delay: "number" },
  },
  () => ({
    delay: (e, ms) => {
      e.pauseMs = ms;
    },
  }),
);