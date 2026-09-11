import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";
import type { InteractionEvent } from "../../interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("../../interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("../interactable-host.ts").defineInteractableHost;

before(async () => {
  dom = setupJsdom();
  await import("./attributable.ts");
  await import("../no-propagate/no-propagate.ts");
  ({ defineInteractableHost } = await import("../interactable-host.ts"));
  defineInteractableHost("div");
  defineInteractableHost("section");
  ({ InteractionEvent: InteractionEventClass } = await import("../../interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(el: Element, verb: string, arg?: unknown): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("setAttr writes an attribute with its value", async () => {
  const el = hostElement("div", { implements: "attributable" });
  document.body.appendChild(el);
  await flush();

  interact(el, "setAttr", { name: "hidden", value: "true" });
  assert.equal(el.getAttribute("hidden"), "true");

  interact(el, "setAttr", { name: "title", value: "hello" });
  assert.equal(el.getAttribute("title"), "hello");
});

test("toggleAttr adds and removes a boolean attribute", async () => {
  const el = hostElement("div", { implements: "attributable" });
  document.body.appendChild(el);
  await flush();

  interact(el, "toggleAttr", "hidden");
  assert.equal(el.hasAttribute("hidden"), true);

  interact(el, "toggleAttr", "hidden");
  assert.equal(el.hasAttribute("hidden"), false);
});

test("removeAttr removes an attribute", async () => {
  const el = hostElement("div", { implements: "attributable", title: "x", "aria-busy": "true" });
  document.body.appendChild(el);
  await flush();

  interact(el, "removeAttr", "title");
  assert.equal(el.hasAttribute("title"), false);

  interact(el, "removeAttr", "aria-busy");
  assert.equal(el.hasAttribute("aria-busy"), false);

  interact(el, "removeAttr", "missing");
  assert.equal(el.hasAttribute("missing"), false);
});

test("attaches to any tag", async () => {
  const el = hostElement("section", { implements: "attributable" });
  document.body.appendChild(el);
  await flush();

  interact(el, "setAttr", { name: "hidden", value: "" });
  assert.equal(el.getAttribute("hidden"), "");
});