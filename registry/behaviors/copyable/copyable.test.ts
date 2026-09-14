import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/copyable/copyable.ts");
  await import("@behaviors/attributable/attributable.ts");
  await import("@behaviors/revealable/revealable.ts");
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("button");
  defineInteractableHost("section");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  installClipboard(undefined);
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
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

test("copy writes the target's text and marks the button copied", async () => {
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
  assert.equal(button.getAttribute("data-copied"), "true");
});

test("a rejected clipboard write falls back and warns, without marking copied", async (t) => {
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
  assert.equal(button.hasAttribute("data-copied"), false);
});

test("without a clipboard API it warns and never marks copied", async (t) => {
  const warn = t.mock.method(console, "warn");
  const button = hostElement("button", { implements: "copyable" });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "plain text";
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  await flush();
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(button.hasAttribute("data-copied"), false);
});

test("an empty target warns without flashing", async (t) => {
  const warn = t.mock.method(console, "warn");
  const button = hostElement("button", { implements: "copyable" });
  const code = hostElement("pre", { id: "code" });
  document.body.append(button, code);
  await flush();
  interact(button, "copy", code);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(button.hasAttribute("data-copied"), false);
});

test("a successful copy runs copyable-after", async () => {
  installClipboard(async () => {});
  const receipt = hostElement("section", { implements: "revealable", id: "receipt", hidden: "" });
  const button = hostElement("button", {
    implements: "copyable",
    id: "copy-btn",
    "copyable-after": "#receipt.show()",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, receipt);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(receipt.getAttribute("data-open"), "true");
});

test("a failed copy runs copyable-error and never marks copied", async () => {
  installClipboard(async () => {
    throw new Error("denied");
  });
  const alert = hostElement("section", { implements: "revealable", id: "alert", hidden: "" });
  const button = hostElement("button", {
    implements: "copyable",
    id: "copy-btn",
    "copyable-error": "#alert.show()",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code, alert);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(alert.getAttribute("data-open"), "true");
  assert.equal(button.hasAttribute("data-copied"), false);
});

test("copyable-after runs with this bound to the button", async () => {
  installClipboard(async () => {});
  const button = hostElement("button", {
    implements: "copyable attributable",
    id: "copy-btn",
    "copyable-after": "this.setAttr({name: 'data-done', value: 'yes'})",
  });
  const code = hostElement("pre", { id: "code" });
  code.textContent = "copy me";
  document.body.append(button, code);
  await flush();

  interact(button, "copy", code);
  await flush();
  assert.equal(button.getAttribute("data-done"), "yes");
});