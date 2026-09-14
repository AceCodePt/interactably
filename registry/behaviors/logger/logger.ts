import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const logger = defineImplementation<
  undefined,
  {},
  {},
  { log: "string | number | boolean | undefined" }
>(
  "logger",
  { verbs: { log: "string | number | boolean | undefined" } },
  (el) => ({
    log: (e, value) => {
      console.log(`${describe(el)} from ${describe(e.source)}:`, value);
    },
  }),
);

function describe(el: Element): string {
  const id = (el as HTMLElement).id;
  return id !== "" ? `${el.localName}#${id}` : el.localName;
}