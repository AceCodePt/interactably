import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";

const CONSTRAINT_ATTRIBUTES = new Set([
  "required",
  "min",
  "max",
  "pattern",
  "minlength",
  "maxlength",
  "step",
  "type",
  "value",
  "checked",
]);

function isUserInteraction(event: Event): boolean {
  if (event instanceof InteractionEvent) return isUserInteraction(event.originalEvent);
  if (event instanceof ImplementationEvent) return false;
  return event.type !== "interaction";
}

export const validatable = defineImplementation(
  "validatable",
  {
    tags: ["form", "input", "select", "textarea"],
    config: {
      on: "'input' | 'change' | undefined",
    },
    verbs: { validate: "undefined" },
    events: {
      valid: {},
      invalid: {},
      "user-valid": {},
      "user-invalid": {},
    },
  },
  (el, attrs) => {
    let valid = el.checkValidity();
    let touched = false;

    const evaluate = (): void => {
      const next = el.checkValidity();
      const changed = next !== valid;
      valid = next;
      el.dispatchEvent(new ImplementationEvent(next ? "valid" : "invalid"));
      if (touched && changed) {
        el.dispatchEvent(new ImplementationEvent(next ? "user-valid" : "user-invalid"));
      }
    };

    const interact = (event: Event): void => {
      if (isUserInteraction(event)) touched = true;
      evaluate();
    };

    const input = (): void => {
      touched = true;
      evaluate();
    };

    return {
      validate: (e) => {
        if (!el.reportValidity()) e.preventDefault();
      },
      onInteraction: interact,
      onRestore: evaluate,
      ...(attrs.on === "change" ? { onChange: input } : { onInput: input }),
      attributeChangedCallback: (name: string): void => {
        if (CONSTRAINT_ATTRIBUTES.has(name)) evaluate();
      },
    };
  },
);
