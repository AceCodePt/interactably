import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let ImplementationEventClass: typeof import("@interactable/implementation-event.ts").ImplementationEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/requestable/requestable.ts");
  await import("@behaviors/attributable/attributable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
  await import("@behaviors/storable/storable.ts");
  await import("@behaviors/validatable/validatable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ ImplementationEvent: ImplementationEventClass } = await import("@interactable/implementation-event.ts"));
  ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
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
  const form = document.createElement("form") as HTMLFormElement;
  form.setAttribute("implements", "validatable");
  const qty = document.createElement("input");
  qty.name = "qty";
  qty.type = "number";
  qty.required = true;
  form.appendChild(qty);
  document.body.appendChild(form);
  return form;
}

function track(el: Element): string[] {
  const events: string[] = [];
  for (const type of ["valid", "invalid", "user-valid", "user-invalid"]) {
    el.addEventListener(type, (event) => {
      if (event instanceof ImplementationEventClass) events.push(type);
    });
  }
  return events;
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
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("implements", "validatable");
  input.required = true;
  document.body.appendChild(input);
  await flush();
  const event = interact(input, "validate");
  assert.equal(event.defaultPrevented, true);
});

test("valid and invalid report every evaluation, including an unchanged state", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("implements", "validatable");
  input.type = "number";
  input.min = "2";
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.value = "1";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.value = "3";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));

  assert.deepEqual(events, ["valid", "invalid", "user-invalid", "valid", "user-valid", "valid"]);
});

test("user validity events require both touch and a transition", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("implements", "validatable");
  input.type = "number";
  input.min = "2";
  input.required = true;
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid"]);

  input.value = "2";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid", "valid", "user-valid"]);

  input.value = "1";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid", "valid", "user-valid", "invalid", "user-invalid"]);

  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid", "valid", "user-valid", "invalid", "user-invalid", "invalid"]);
});

test("a storable restore can install invalid data without firing user-invalid", async () => {
  localStorage.setItem("draft", "17");
  const holder = document.createElement("div");
  holder.innerHTML =
    '<input type="number" min="18" required implements="validatable storable modifiable" ' +
    'storable-key="draft" storable-value="20" on-restore(value:string)="this.set(value)">';
  const input = holder.firstElementChild as HTMLInputElement;
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  interact(input, "restore");

  assert.equal(input.value, "17");
  assert.ok(events.includes("invalid"));
  assert.equal(events.includes("user-invalid"), false);
});

test("a form reports the aggregate validity of all its controls", async () => {
  const form = document.createElement("form") as HTMLFormElement;
  form.setAttribute("implements", "validatable");
  const first = document.createElement("input") as HTMLInputElement;
  first.required = true;
  const second = document.createElement("input") as HTMLInputElement;
  second.required = true;
  form.append(first, second);
  document.body.appendChild(form);
  await flush();
  const events = track(form);

  first.value = "one";
  first.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid"]);

  second.value = "two";
  second.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid", "valid", "user-valid"]);

  second.value = "";
  second.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["invalid", "valid", "user-valid", "invalid", "user-invalid"]);
});

test("validatable-on=change defers evaluation while the default listens to input", async () => {
  const onChange = document.createElement("input") as HTMLInputElement;
  onChange.setAttribute("implements", "validatable");
  onChange.setAttribute("validatable-on", "change");
  onChange.type = "number";
  onChange.required = true;
  document.body.appendChild(onChange);
  await flush();
  const changeEvents = track(onChange);

  onChange.value = "2";
  onChange.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(changeEvents, []);
  onChange.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(changeEvents, ["valid", "user-valid"]);

  const onInput = document.createElement("input") as HTMLInputElement;
  onInput.setAttribute("implements", "validatable");
  onInput.type = "number";
  onInput.required = true;
  document.body.appendChild(onInput);
  await flush();
  const inputEvents = track(onInput);
  onInput.value = "2";
  onInput.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(inputEvents, ["valid", "user-valid"]);
});

test("changing a constraint attribute re-evaluates validity", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("implements", "validatable");
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  input.setAttribute("required", "");
  await flush();
  assert.deepEqual(events, ["invalid"]);

  input.removeAttribute("required");
  await flush();
  assert.deepEqual(events, ["invalid", "valid"]);
});
