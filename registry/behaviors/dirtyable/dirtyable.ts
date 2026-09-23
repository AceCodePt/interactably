import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

function isCheckable(el: HTMLElement): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
}

export const dirtyable = defineImplementation(
  "dirtyable",
  {
    tags: ["input", "textarea", "select", "output"],
    config: {
      "dirty-on": "'input' | 'change' | undefined",
    },
    verbs: {},
    events: { dirty: {}, clean: {} },
  },
  (el, attrs) => {
    const isDirty = (): boolean => {
      if (el instanceof HTMLSelectElement) {
        for (const option of Array.from(el.options)) {
          if (option.selected !== option.defaultSelected) return true;
        }
        return false;
      }
      if (isCheckable(el)) return el.checked !== el.defaultChecked;
      return el.value !== el.defaultValue;
    };

    let dirty = isDirty();
    const evaluate = (): void => {
      const next = isDirty();
      if (next === dirty) return;
      dirty = next;
      el.dispatchEvent(new ImplementationEvent(next ? "dirty" : "clean"));
    };

    // restore is subscribed through the host's on* binding, so storable's restore
    // event re-evaluates without any manual addEventListener / removal here.
    const listeners = {
      onInteraction: evaluate,
      onRestore: evaluate,
      ...(attrs["dirty-on"] === "change" ? { onChange: evaluate } : { onInput: evaluate }),
    };

    return {
      ...listeners,
      attributeChangedCallback: (name: string): void => {
        if (name === "value" || name === "checked") evaluate();
      },
    };
  },
);