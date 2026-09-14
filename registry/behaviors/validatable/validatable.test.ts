import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/requestable/requestable.ts");
  await import("@behaviors/validatable/validatable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

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

function mountForm(): HTMLFormElement {
  const form = document.createElement("form", { is: "interactable-form" }) as HTMLFormElement;
  form.setAttribute("implements", "validatable");
  const qty = document.createElement("input");
  qty.name = "qty";
  qty.type = "number";
  qty.required = true;
  form.appendChild(qty);
  document.body.appendChild(form);
  return form;
}

test("validate() lets a valid form through", async () => {
  const form = mountForm();
  await flush();
  (form.elements.namedItem("qty") as HTMLInputElement).value = "2";
  const event = interact(form, "validate");
  assert.equal(event.handled, true);
  assert.equal(event.defaultPrevented, false);
});

test("validate() calls preventDefault when reportValidity() is false", async () => {
  const form = mountForm();
  await flush();
  const event = interact(form, "validate");
  assert.equal(event.handled, true);
  assert.equal(event.defaultPrevented, true);
});

test("validate() on an input uses the platform's own reportValidity", async () => {
  const input = document.createElement("input", { is: "interactable-input" }) as HTMLInputElement;
  input.setAttribute("implements", "validatable");
  input.required = true;
  document.body.appendChild(input);
  await flush();
  const event = interact(input, "validate");
  assert.equal(event.defaultPrevented, true);
});
