import { defineImplementation } from "../_implementation-definition.ts";

export const storage = defineImplementation("storage", {
  config: {
    key: "string | undefined",
    type: "'local' | 'session' | undefined",
    attr: "string | undefined",
  },
  verbs: { save: "undefined", load: "undefined", clear: "undefined" },
}, (el, attrs) => {
  const store = (): Storage | null => {
    if (attrs.type === "session") return typeof sessionStorage === "undefined" ? null : sessionStorage;
    return typeof localStorage === "undefined" ? null : localStorage;
  };

  const readFromElement = (): string | null => {
    const name = attrs.attr ?? "value";
    if (name in el) return String((el as unknown as Record<string, unknown>)[name]);
    return el.getAttribute(name);
  };

  const writeToElement = (value: string): void => {
    const name = attrs.attr ?? "value";
    if (name in el) {
      (el as unknown as Record<string, unknown>)[name] = value;
      return;
    }
    el.setAttribute(name, value);
  };

  const restore = (): void => {
    const key = attrs.key;
    if (key === undefined) return;
    const stored = store()?.getItem(key);
    if (stored !== null && stored !== undefined) writeToElement(stored);
  };

  const persist = (): void => {
    const key = attrs.key;
    if (key === undefined) return;
    const value = readFromElement();
    if (value !== null) store()?.setItem(key, value);
  };

  return {
    connectedCallback: restore,
    onInput: persist,
    onChange: persist,
    load: () => restore(),
    save: () => persist(),
    clear: () => {
      const key = attrs.key;
      if (key !== undefined) store()?.removeItem(key);
    },
  };
});
