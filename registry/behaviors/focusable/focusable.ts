import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { describeElement } from "@interactable/describe-element.ts";
import { logOnce } from "@interactable/log.ts";

const FOCUS_DID_NOT_TAKE = (el: HTMLElement): string =>
  `focusable: focus() on ${describeElement(el)} did not take — the element is not focusable; add tabindex="-1" or put focusable on the control inside it`;

export const focusable = defineImplementation(
  "focusable",
  {
    verbs: {
      focus: "undefined",
      blur: "undefined",
    },
  },
  (el) => ({
    focus: () => {
      el.focus();
      if (document.activeElement !== el && el.isConnected) {
        logOnce(el, FOCUS_DID_NOT_TAKE(el));
      }
    },
    blur: () => {
      el.blur();
    },
  }),
);