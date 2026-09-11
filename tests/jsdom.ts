import { JSDOM } from "jsdom";

const GLOBAL_KEYS = [
  "window",
  "document",
  "customElements",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLFormElement",
  "HTMLAnchorElement",
  "HTMLDetailsElement",
  "HTMLDialogElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLOutputElement",
  "HTMLDivElement",
  "HTMLUListElement",
  "HTMLTemplateElement",
  "HTMLSectionElement",
  "Node",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
] as const;

export function setupJsdom(html = "<!doctype html><html><body></body></html>"): JSDOM {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  const win = dom.window as unknown as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    if (key in win) (globalThis as unknown as Record<string, unknown>)[key] = win[key];
  }
  return dom;
}

export function teardownJsdom(dom: JSDOM): void {
  dom.window.close();
  for (const key of GLOBAL_KEYS) {
    Reflect.deleteProperty(globalThis, key);
  }
}

export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}