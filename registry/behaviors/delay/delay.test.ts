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
  await import("@behaviors/delay/delay.ts");
  await import("@behaviors/attributable/attributable.ts");
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("button");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
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

test("delay() marks the interaction event with pauseMs", async () => {
  const el = hostElement("button", { implements: "delay" });
  document.body.appendChild(el);
  await flush();

  const event = interact(el, "delay", 250);
  assert.equal(event.pauseMs, 250);
});

test("this.delay().setAttr() sets the attribute after the pause", async () => {
  const button = hostElement("button", {
    implements: "delay attributable",
    "on-click": "this.delay(20).setAttr({name: 'data-x', value: 'y'})",
  });
  document.body.appendChild(button);
  await flush();

  button.click();
  assert.equal(button.hasAttribute("data-x"), false);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(button.getAttribute("data-x"), "y");
});