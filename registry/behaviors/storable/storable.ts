import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const storable = defineImplementation(
  "storable",
  {
    tags: ["input", "select", "textarea"],
    config: {
      scope: "'local' | 'session' | undefined",
      key: "string | undefined",
    },
    verbs: {
      save: "undefined",
      load: "undefined",
      clear: "undefined",
    },
  },
  (el, attrs) => {
    const doc = el.ownerDocument;
    const checkable = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");

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
      const name = el.name;
      const key = attrs.key || (name !== "" ? name : el.id);
      if (key !== "") return `interactable:${key}`;
      if (!warned) {
        warned = true;
        console.warn("[Interactable] storable: the field has no storable-key, no name and no id");
      }
      return null;
    };

    const dispatchChange = (): void => {
      el.dispatchEvent(new Event("change", { bubbles: true }));
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
        const target = values.includes(el.value);
        if (el.checked === target) return;
        el.checked = target;
        if (el.type === "radio" && !target) return;
        dispatchChange();
        return;
      }
      if (el.value === stored) return;
      el.value = stored;
      dispatchChange();
    };

    let pendingReady: (() => void) | null = null;

    return {
      save: (): void => {
        const key = storageKey();
        if (key === null) return;
        if (checkable) {
          const name = el.name;
          if (name === "") return;
          const owner = el.form ?? document;
          const checked: string[] = [];
          for (const control of owner.querySelectorAll<HTMLInputElement>(
            "input[type='radio'], input[type='checkbox']",
          )) {
            if (control.name === name && control.checked) checked.push(control.value);
          }
          write(key, JSON.stringify(checked));
          return;
        }
        write(key, String(el.value));
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
        if (doc.readyState === "loading") {
          pendingReady = (): void => {
            pendingReady = null;
            if (!el.isConnected) return;
            restore();
          };
          doc.addEventListener("DOMContentLoaded", pendingReady, { once: true });
          return;
        }
        restore();
      },
      disconnectedCallback: (): void => {
        if (pendingReady !== null) {
          doc.removeEventListener("DOMContentLoaded", pendingReady);
          pendingReady = null;
        }
      },
    };
  },
);
