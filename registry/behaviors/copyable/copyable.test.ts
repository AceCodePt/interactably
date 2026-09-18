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

test("copy writes the target's text without touching any attribute", async () => {
  const copied: string[] = [];
  installClipboard(async (text) => {
    copied.push(text);
  });
  const button = hostElement("button", { implements: "copyable", id: "copy-btn" });
  const code = hostElement("pre", { id: "quick-start" });
  code.textContent = "const x = 1;";
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  await flush();
  assert.equal(copied.length, 1);
  assert.equal(copied[0], "const x = 1;");
  assert.deepEqual(button.getAttributeNames(), ["implements", "id"], "copy itself never writes an attribute");
});

test("a rejected clipboard write falls back and warns", async (t) => {
  const warn = t.mock.method(console, "warn");
  installClipboard(async () => {
    throw new Error("denied");
  });
  const button = hostElement("button", { implements: "copyable" });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "fallback";
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  await flush();
  assert.equal(warn.mock.callCount(), 1);
});

test("without a clipboard API it warns", async (t) => {
  const warn = t.mock.method(console, "warn");
  const button = hostElement("button", { implements: "copyable" });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "plain text";
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  await flush();
  assert.equal(warn.mock.callCount(), 1);
});

test("an empty target warns", async (t) => {
  const warn = t.mock.method(console, "warn");
  const button = hostElement("button", { implements: "copyable" });
  const code = hostElement("pre", { id: "code" });
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  assert.equal(warn.mock.callCount(), 1);
});

test("the flash is the trigger attribute's job: on-copy marks, then debounces the clear", async () => {
  installClipboard(async () => {});
  const button = hostElement("button", {
    implements: "copyable attributable",
    id: "copy-btn",
    "on-copy": "this.setAttr({name: 'data-copied', value: 'true'}); this.debounce(20).removeAttr('data-copied')",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(button.getAttribute("data-copied"), "true", "on-copy marks the button");

  await delay(60);
  assert.equal(button.hasAttribute("data-copied"), false, "the debounced reset removes the marker");
});

test("a successful copy runs on-copy", async () => {
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const button = hostElement("button", {
    implements: "copyable",
    id: "copy-btn",
    "on-copy": "#receipt.show()",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, receipt);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(receipt.getAttribute("revealable-open"), "true");
});

test("a failed copy warns and never fires on-copy", async () => {
  installClipboard(async () => {
    throw new Error("denied");
  });
  const alert = hostElement("section", { implements: "revealable", id: "alert", hidden: "" });
  const button = hostElement("button", {
    implements: "copyable",
    id: "copy-btn",
    "on-copy": "#alert.show()",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, alert);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(alert.hidden, true);
});

test("a native copy event on a copyable element does not run on-copy", async (t) => {
  const warn = t.mock.method(console, "warn");
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const button = hostElement("button", {
    implements: "copyable",
    id: "copy-btn",
    "on-copy": "#receipt.show()",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, receipt);
  await flush();

  button.dispatchEvent(new Event("copy"));
  assert.equal(receipt.hidden, true, "the native clipboard event does not fire copyable's on-copy");
  assert.equal(warn.mock.callCount(), 0, "a declared event never triggers the no-such-event warning");
});

test("a native copy event on a non-copyable element does run on-copy", async () => {
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const button = hostElement("button", { id: "copy-btn", "on-copy": "#receipt.show()" });
  document.body.append(button, receipt);
  await flush();

  button.dispatchEvent(new Event("copy"));
  await flush();
  assert.equal(receipt.hidden, false, "without copyable the plain DOM copy event fires the phrase");
});

test("implements added after wiring is respected at dispatch time", async () => {
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const button = hostElement("button", { id: "late-btn", "on-copy": "#receipt.show()" });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, receipt);
  await flush();

  button.dispatchEvent(new Event("copy"));
  await flush();
  assert.equal(receipt.hidden, false, "before copyable attaches, the native copy event fires the phrase");

  button.setAttribute("implements", "copyable");
  await flush();
  receipt.hidden = true;

  button.dispatchEvent(new Event("copy"));
  await flush();
  assert.equal(receipt.hidden, true, "once copyable declares copy, the native event no longer fires on-copy");
});

test("on-copy runs with this bound to the button", async () => {
  installClipboard(async () => {});
  const button = hostElement("button", {
    implements: "copyable attributable",
    id: "copy-btn",
    "on-copy": "this.setAttr({name: 'data-done', value: 'yes'})",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(button.getAttribute("data-done"), "yes");
});