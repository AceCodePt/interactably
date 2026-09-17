import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const storable = defineImplementation(
  "storable",
  {
    config: {
      scope: "'local' | 'session' | undefined",
      key: "string",
      value: "string",
    },
    verbs: {
      save: "undefined",
      restore: "undefined",
      clear: "undefined",
    },
    events: ["restore"],
  },
  (el, attrs) => {
    const key = attrs.key;
    const value = attrs.value;

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

    const dispatchRestore = (): void => {
      el.dispatchEvent(new ImplementationEvent("restore"));
    };

    return {
      save: (): void => {
        write(key, value);
      },
      restore: (): void => {
        if (read(key) === value) dispatchRestore();
      },
      clear: (): void => {
        remove(key);
      },
    };
  },
);