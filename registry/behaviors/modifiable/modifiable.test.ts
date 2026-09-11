import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";
import type { InteractionEvent } from "../../interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("../../interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("./modifiable.ts");
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

test("set writes the value property and dispatches a synthetic input event", async () => {
  const input = hostElement("input", { implements: "modifiable" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  let inputs = 0;
  input.addEventListener("input", () => inputs++);

  interact(input, "set", "42");
  assert.equal(input.value, "42");
  assert.equal(inputs, 1);
});

test("set does not dispatch when the value is unchanged", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "7" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  let inputs = 0;
  input.addEventListener("input", () => inputs++);

  interact(input, "set", "7");
  assert.equal(inputs, 0);

  interact(input, "set", "8");
  assert.equal(inputs, 1);
});

test("inc and dec step by 1 by default and accept an explicit amount", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "5" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "inc");
  assert.equal(input.value, "6");
  interact(input, "dec");
  assert.equal(input.value, "5");
  interact(input, "inc", 10);
  assert.equal(input.value, "15");
  interact(input, "dec", 4);
  assert.equal(input.value, "11");
});

test("modifiable-step config is the default step", async () => {
  const input = hostElement("input", { implements: "modifiable", "modifiable-step": "3", value: "0" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "inc");
  assert.equal(input.value, "3");
  interact(input, "dec");
  assert.equal(input.value, "0");
});

test("inc and dec clamp through the platform's own min and max", async () => {
  const input = hostElement("input", {
    implements: "modifiable",
    type: "number",
    value: "8",
    min: "0",
    max: "10",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "inc", 5);
  assert.equal(input.value, "10");
  interact(input, "dec", 5);
  assert.equal(input.value, "5");
  interact(input, "dec", 100);
  assert.equal(input.value, "0");
  interact(input, "inc", 100);
  assert.equal(input.value, "10");
});

test("clear writes an empty string", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "abc" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "clear");
  assert.equal(input.value, "");
});

test("reset returns to the authored value attribute", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "9" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  input.value = "3";
  interact(input, "reset");
  assert.equal(input.value, "9");

  interact(input, "clear");
  interact(input, "reset");
  assert.equal(input.value, "9");
});

test("reset with no value attribute writes an empty string", async () => {
  const input = hostElement("input", { implements: "modifiable" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  input.value = "x";
  interact(input, "reset");
  assert.equal(input.value, "");
});

test("works on textarea, select and output", async () => {
  const textarea = hostElement("textarea", { implements: "modifiable" }) as HTMLTextAreaElement;
  textarea.textContent = "hello";
  document.body.appendChild(textarea);
  await flush();
  interact(textarea, "set", "bye");
  assert.equal(textarea.value, "bye");

  const select = hostElement("select", { implements: "modifiable" }) as HTMLSelectElement;
  const option = document.createElement("option");
  option.value = "b";
  option.textContent = "bee";
  select.appendChild(option);
  document.body.appendChild(select);
  await flush();
  interact(select, "set", "b");
  assert.equal(select.value, "b");

  const output = hostElement("output", { implements: "modifiable" }) as HTMLOutputElement;
  document.body.appendChild(output);
  await flush();
  interact(output, "set", "6");
  assert.equal(output.value, "6");
  assert.equal(output.textContent, "6");
});

test("inc reads the current value back off the element", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "1" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  input.value = "3";
  interact(input, "inc");
  assert.equal(input.value, "4");
});