import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const storable = defineImplementation(
  "storable",
  {
    config: {
      scope: "'local' | 'session' | undefined",
      key: "string | undefined",
      value: "string | undefined",
    },
    verbs: {
      save: "undefined",
      load: "undefined",
      clear: "undefined",
    },
    events: ["restore"],
  },
  (el, attrs) => {
    const input = el as HTMLInputElement;
    const checkable = el instanceof HTMLInputElement && (input.type === "radio" || input.type === "checkbox");

    const storage = (): Storage | null => {
      const store = attrs.scope === "session" ? sessionStorage : localStorage;
      return typeof store === "undefined" ? null : store;
    };

    const read = (key: string): string | null => {
      try {
        return storage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    };

    const write = (key: string, value: string): void => {
      try {
        storage()?.setItem(key, value);
      } catch {
        return;
      }
    };

    const remove = (key: string): void => {
      try {
        storage()?.removeItem(key);
      } catch {
        return;
      }
    };

    let warned = false;
    const storageKey = (): string | null => {
      const own = (el as { name?: unknown }).name;
      const name = typeof own === "string" ? own : "";
      const key = attrs.key || name || el.id;
      if (key !== "") return `interactable:${key}`;
      if (!warned) {
        warned = true;
        console.warn("[Interactable] storable: the field has no storable-key, no name and no id");
      }
      return null;
    };

    let warnedValue = false;
    const resolvedValue = (): string | undefined => {
      if (attrs.value !== undefined) return attrs.value;
      const own = (el as { value?: unknown }).value;
      return typeof own === "string" ? own : undefined;
    };
    const warnIfNoValue = (): void => {
      if (warnedValue) return;
      if (resolvedValue() !== undefined) return;
      warnedValue = true;
      console.warn("[Interactable] storable: the element has no storable-value and no value to store");
    };

    const dispatchRestore = (): void => {
      el.dispatchEvent(new ImplementationEvent("restore"));
    };

    const restore = (): void => {
      const key = storageKey();
      if (key === null) return;
      const stored = read(key);
      if (stored === null) return;
      if (checkable) {
        let values: unknown;
        try {
          values = JSON.parse(stored);
        } catch {
          return;
        }
        if (!Array.isArray(values)) return;
        const target = values.includes(input.value);
        if (input.checked === target) {
          if (target) dispatchRestore();
          return;
        }
        input.checked = target;
        if (input.type === "radio" && !target) return;
        dispatchRestore();
        return;
      }
      const resolved = resolvedValue();
      if (resolved === undefined) return;
      if (stored === resolved) {
        dispatchRestore();
        return;
      }
      if (attrs.value !== undefined) return;
      (el as { value?: unknown }).value = stored;
      dispatchRestore();
    };

    return {
      save: (): void => {
        const key = storageKey();
        if (key === null) return;
        if (checkable) {
          const name = input.name;
          if (name === "") return;
          const owner = input.form ?? document;
          const checked: string[] = [];
          for (const control of owner.querySelectorAll<HTMLInputElement>(
            "input[type='radio'], input[type='checkbox']",
          )) {
            if (control.name === name && control.checked) checked.push(control.value);
          }
          write(key, JSON.stringify(checked));
          return;
        }
        const resolved = resolvedValue();
        if (resolved === undefined) return;
        write(key, resolved);
      },
      load: (): void => {
        restore();
      },
      clear: (): void => {
        const key = storageKey();
        if (key === null) return;
        remove(key);
      },
      connectedCallback: (): void => {
        warnIfNoValue();
        restore();
      },
    };
  },
);
