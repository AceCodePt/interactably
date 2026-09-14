import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const autoGrow = defineImplementation("auto-grow", {
  tags: ["textarea"],
  verbs: {},
}, (el) => {
  const grow = (): void => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  return {
    connectedCallback: () => {
      el.style.overflowY = "hidden";
      el.style.resize = "none";
    },
    onInput: grow,
    onChange: grow,
  };
});
