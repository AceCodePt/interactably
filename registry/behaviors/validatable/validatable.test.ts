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
  form.setAttribute("validatable", "");
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
  for (const type of ["valid", "invalid"]) {
    el.addEventListener(type, (event) => {
      if (event instanceof ImplementationEventClass) events.push(type);
    });
  }
  return events;
}

test("reportValidity() lets a valid form through and announces valid", async () => {
  const form = mountForm();
  await flush();
  (form.elements.namedItem("qty") as HTMLInputElement).value = "2";
  const events = track(form);

  const event = interact(form, "reportValidity");

  assert.equal(event.handled, true);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(events, ["valid"]);
});

test("reportValidity() calls preventDefault and announces invalid", async () => {
  const form = mountForm();
  await flush();
  const events = track(form);

  const event = interact(form, "reportValidity");

  assert.equal(event.handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(events, ["invalid"]);
});

test("reportValidity() on a field uses the platform's own report", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("validatable", "");
  input.required = true;
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  const event = interact(input, "reportValidity");

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(events, ["invalid"]);
});

test("checkValidity() announces the answer without preventing the chain", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("validatable", "");
  input.required = true;
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  const invalid = interact(input, "checkValidity");
  assert.equal(invalid.handled, true);
  assert.equal(invalid.defaultPrevented, false);
  assert.deepEqual(events, ["invalid"]);

  input.value = "Ada";
  const valid = interact(input, "checkValidity");
  assert.equal(valid.defaultPrevented, false);
  assert.deepEqual(events, ["invalid", "valid"]);
});

test("every call reports, even when the answer did not change", async () => {
  const input = document.createElement("input") as HTMLInputElement;
  input.setAttribute("validatable", "");
  input.type = "number";
  input.min = "2";
  input.value = "3";
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  interact(input, "checkValidity");
  interact(input, "checkValidity");
  input.value = "1";
  interact(input, "checkValidity");

  assert.deepEqual(events, ["valid", "valid", "invalid"]);
});

test("input, change, attribute writes and restores stay silent until a verb asks", async () => {
  localStorage.setItem("draft", JSON.stringify({ value: "17" }));
  const holder = document.createElement("div");
  holder.innerHTML =
    '<input type="number" min="18" required validatable storable modifiable ' +
    'storable-id="draft" on-restore="({value: string}) => { this.set(value) }">';
  const input = holder.firstElementChild as HTMLInputElement;
  document.body.appendChild(input);
  await flush();
  const events = track(input);

  input.value = "1";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.setAttribute("min", "19");
  await flush();
  interact(input, "restore");

  assert.equal(input.value, "17");
  assert.deepEqual(events, []);
});

test("a form reports the aggregate validity of all its controls", async () => {
  const form = document.createElement("form") as HTMLFormElement;
  form.setAttribute("validatable", "");
  const first = document.createElement("input") as HTMLInputElement;
  first.required = true;
  const second = document.createElement("input") as HTMLInputElement;
  second.required = true;
  form.append(first, second);
  document.body.appendChild(form);
  await flush();
  const events = track(form);

  first.value = "one";
  interact(form, "checkValidity");
  assert.deepEqual(events, ["invalid"]);

  second.value = "two";
  interact(form, "checkValidity");
  assert.deepEqual(events, ["invalid", "valid"]);

  second.value = "";
  interact(form, "checkValidity");
  assert.deepEqual(events, ["invalid", "valid", "invalid"]);
});

test("a form reports the aggregate event on the form, not its fields", async () => {
  const form = mountForm();
  await flush();
  const field = form.elements.namedItem("qty") as HTMLInputElement;
  const formEvents = track(form);
  const fieldEvents = track(field);

  interact(form, "checkValidity");

  assert.deepEqual(formEvents, ["invalid"]);
  assert.deepEqual(fieldEvents, []);
});
