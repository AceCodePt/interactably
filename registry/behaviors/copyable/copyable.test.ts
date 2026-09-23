import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/copyable/copyable.ts");
  await import("@behaviors/attributable/attributable.ts");
  await import("@behaviors/revealable/revealable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  installClipboard(undefined);
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(el: Element, verb: string, arg?: unknown, source?: Element): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: source ?? el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

function installClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("copy() on the copied element writes its own text without touching any attribute", async () => {
  const copied: string[] = [];
  installClipboard(async (text) => {
    copied.push(text);
  });
  const code = hostElement("pre", { implements: "copyable", id: "quick-start" });
  code.textContent = "const x = 1;";
  document.body.append(code);
  await flush();
  interact(code, "copy");
  await flush();
  assert.equal(copied.length, 1);
  assert.equal(copied[0], "const x = 1;");
  assert.deepEqual(code.getAttributeNames(), ["implements", "id"], "copy itself never writes an attribute");
});

test("copy() returns synchronously: no promise, no executor warning", async (t) => {
  const warn = t.mock.method(console, "warn");
  installClipboard(async () => {});
  const code = hostElement("pre", { implements: "copyable", id: "code" });
  code.textContent = "copy me";
  document.body.append(code);
  await flush();
  const event = interact(code, "copy");
  assert.equal(event.result, undefined, "copy() returns undefined, never a promise");
  await flush();
  assert.equal(warn.mock.callCount(), 0, "the executor never warns about a promise return");
});

test("a successful copy dispatches copy and runs on-copy with this bound to the copied element", async () => {
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const code = hostElement("pre", {
    implements: "copyable attributable",
    id: "code",
    "on-copy": "this.setAttr({name: 'data-done', value: 'yes'})",
  });
  code.textContent = "copy me";
  document.body.append(code, receipt);
  await flush();

  interact(code, "copy");
  await flush();
  assert.equal(code.getAttribute("data-done"), "yes", "on-copy runs with this bound to the copied element");
});

test("the flash pattern marks the button via a back-pointer on the copied element's on-copy", async () => {
  installClipboard(async () => {});
  const button = hostElement("button", { implements: "attributable", id: "copy-btn" });
  const code = hostElement("pre", {
    implements: "copyable",
    id: "code",
    "on-copy": "#copy-btn.setAttr({name: 'data-copied', value: 'true'}).delay(20).removeAttr('data-copied')",
  });
  code.textContent = "copy me";
  document.body.append(button, code);
  await flush();

  interact(code, "copy");
  await flush();
  assert.equal(button.getAttribute("data-copied"), "true", "on-copy marks the button via the back-pointer");

  await delay(60);
  assert.equal(button.hasAttribute("data-copied"), false, "the delayed reset removes the marker");
});

test("a native copy event on a copyable element does run on-copy", async () => {
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const code = hostElement("pre", {
    implements: "copyable",
    id: "code",
    "on-copy": "#receipt.show()",
  });
  code.textContent = "copy me";
  document.body.append(code, receipt);
  await flush();

  code.dispatchEvent(new Event("copy"));
  await flush();
  assert.equal(receipt.hidden, false, "the native clipboard event fires copyable's on-copy too");
});

test("a native copy event on a non-copyable element does run on-copy", async () => {
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const code = hostElement("pre", { id: "code", "on-copy": "#receipt.show()" });
  code.textContent = "copy me";
  document.body.append(code, receipt);
  await flush();

  code.dispatchEvent(new Event("copy"));
  await flush();
  assert.equal(receipt.hidden, false, "without copyable the plain DOM copy event fires the phrase");
});

test("a total failure fires on-copy-error and never on-copy, with no console.warn", async (t) => {
  const warn = t.mock.method(console, "warn");
  installClipboard(async () => {
    throw new Error("denied");
  });
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const alert = hostElement("section", { implements: "revealable", id: "alert", hidden: "" });
  const code = hostElement("pre", {
    implements: "copyable",
    id: "code",
    "on-copy": "#receipt.show()",
    "on-copy-error": "#alert.show()",
  });
  code.textContent = "copy me";
  document.body.append(code, receipt, alert);
  await flush();

  interact(code, "copy");
  await flush();
  assert.equal(receipt.hidden, true, "on-copy never fires on total failure");
  assert.equal(alert.hidden, false, "on-copy-error fires when the clipboard write and the fallback both fail");
  assert.equal(warn.mock.callCount(), 0, "the failure path never warns");
});

test("without a clipboard API a failed fallback fires on-copy-error, never on-copy", async (t) => {
  const warn = t.mock.method(console, "warn");
  const alert = hostElement("section", { implements: "revealable", id: "alert", hidden: "" });
  const code = hostElement("pre", {
    implements: "copyable",
    id: "code",
    "on-copy-error": "#alert.show()",
  });
  code.textContent = "plain text";
  document.body.append(code, alert);
  await flush();

  interact(code, "copy");
  await flush();
  assert.equal(alert.hidden, false, "no clipboard API plus a failed fallback fires on-copy-error");
  assert.equal(warn.mock.callCount(), 0);
});

test("empty text is a no-op: it fires neither copy nor copy-error", async (t) => {
  const warn = t.mock.method(console, "warn");
  const code = hostElement("pre", { implements: "copyable", id: "code" });
  code.textContent = "   ";
  let copies = 0;
  let errors = 0;
  code.addEventListener("copy", () => copies++);
  code.addEventListener("copy-error", () => errors++);
  document.body.append(code);
  await flush();

  interact(code, "copy");
  await flush();
  assert.equal(copies, 0, "empty text never fires copy");
  assert.equal(errors, 0, "empty text never fires copy-error");
  assert.equal(warn.mock.callCount(), 0, "empty text is a no-op, not a warning");
});