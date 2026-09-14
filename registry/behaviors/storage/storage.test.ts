import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

const GLOBAL_KEYS = [
  "window",
  "document",
  "customElements",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLDivElement",
  "Event",
  "localStorage",
  "sessionStorage",
] as const;

let dom: JSDOM;
let InteractionEventClass: typeof InteractionEvent;

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  const win = dom.window as unknown as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    if (key in win) (globalThis as unknown as Record<string, unknown>)[key] = win[key];
  }
  await import("@behaviors/no-propagate/no-propagate.ts");
  await import("@behaviors/storage/storage.ts");
  await import("@behaviors/interactable-host.ts");
  const host = await import("@behaviors/interactable-host.ts");
  host.defineInteractableHost("input");
  host.defineInteractableHost("div");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  dom.window.close();
  for (const key of GLOBAL_KEYS) {
    Reflect.deleteProperty(globalThis, key);
  }
});

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
});

function element(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  el.setAttribute("implements", "storage");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(el: Element, verb: string): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg: undefined,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("storage restores the value from localStorage on connect", async () => {
  localStorage.setItem("draft", "saved");
  const el = element("input", { "storage-key": "draft" }) as HTMLInputElement;
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "saved");
});

test("storage persists the value to localStorage on input and change", async () => {
  const el = element("input", { "storage-key": "draft" }) as HTMLInputElement;
  document.body.appendChild(el);
  await flush();

  el.value = "typed";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(localStorage.getItem("draft"), "typed");

  el.value = "changed";
  el.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("draft"), "changed");
});

test("storage reads and writes sessionStorage when storage-type is session", async () => {
  sessionStorage.setItem("session", "secret");
  const el = element("input", { "storage-key": "session", "storage-type": "session" }) as HTMLInputElement;
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "secret");

  el.value = "other";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(sessionStorage.getItem("session"), "other");
  assert.equal(localStorage.getItem("session"), null);
});

test("storage syncs an arbitrary attribute via storage-attr", async () => {
  localStorage.setItem("theme", "dark");
  const el = element("div", { "storage-key": "theme", "storage-attr": "data-theme" }) as HTMLDivElement;
  document.body.appendChild(el);
  await flush();
  assert.equal(el.getAttribute("data-theme"), "dark");

  el.setAttribute("data-theme", "light");
  el.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("theme"), "light");
});

test("save, load and clear are explicit verbs", async () => {
  const el = element("input", { "storage-key": "draft" }) as HTMLInputElement;
  document.body.appendChild(el);
  await flush();

  el.value = "typed";
  interact(el, "save");
  assert.equal(localStorage.getItem("draft"), "typed");

  localStorage.setItem("draft", "external");
  interact(el, "load");
  assert.equal(el.value, "external");

  interact(el, "clear");
  assert.equal(localStorage.getItem("draft"), null);
  assert.equal(el.value, "external");
});

test("storage without a key never touches storage", async () => {
  const el = element("input", {}) as HTMLInputElement;
  document.body.appendChild(el);
  await flush();

  el.value = "x";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(localStorage.length, 0);

  interact(el, "save");
  interact(el, "clear");
  assert.equal(localStorage.length, 0);
});