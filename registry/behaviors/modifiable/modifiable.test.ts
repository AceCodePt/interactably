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
  await import("@behaviors/modifiable/modifiable.ts");
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
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
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

test("set writes the value property and does not dispatch an input event", async () => {
  const input = hostElement("input", { implements: "modifiable" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  let inputs = 0;
  input.addEventListener("input", () => inputs++);

  interact(input, "set", "42");
  assert.equal(input.value, "42");
  assert.equal(inputs, 0);
});

test("set never dispatches, even when the value changes", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "7" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  let inputs = 0;
  input.addEventListener("input", () => inputs++);

  interact(input, "set", "7");
  assert.equal(inputs, 0);

  interact(input, "set", "8");
  assert.equal(inputs, 0);
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

test("inc and dec accept a numeric string from a text input", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "5" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "inc", "5");
  assert.equal(input.value, "10");
  interact(input, "dec", "3");
  assert.equal(input.value, "7");
});

test("a numeric verb that cannot read its string reports the verb and the raw input", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "5" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const event = interact(input, "inc", "banana");
  assert.match(String(event.error), /inc\(\) could not read a number from "banana"/);
  assert.equal(input.value, "5");
});

test("set accepts both a string and a number", async () => {
  const input = hostElement("input", { implements: "modifiable" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  interact(input, "set", "42");
  assert.equal(input.value, "42");
  interact(input, "set", 7);
  assert.equal(input.value, "7");
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

test("reset on a textarea returns to its authored text", async () => {
  const textarea = hostElement("textarea", { implements: "modifiable" }) as HTMLTextAreaElement;
  textarea.textContent = "hello";
  document.body.appendChild(textarea);
  await flush();

  interact(textarea, "set", "bye");
  assert.equal(textarea.value, "bye");
  interact(textarea, "reset");
  assert.equal(textarea.value, "hello");
});

test("reset on a select returns to the option carrying the selected attribute", async () => {
  const select = hostElement("select", { implements: "modifiable" }) as HTMLSelectElement;
  const a = document.createElement("option");
  a.value = "a";
  const b = document.createElement("option");
  b.value = "b";
  b.setAttribute("selected", "");
  select.append(a, b);
  document.body.appendChild(select);
  await flush();

  interact(select, "set", "a");
  assert.equal(select.value, "a");
  interact(select, "reset");
  assert.equal(select.value, "b");
});

test("reset on a select with no selected attribute returns to the first option", async () => {
  const select = hostElement("select", { implements: "modifiable" }) as HTMLSelectElement;
  const a = document.createElement("option");
  a.value = "a";
  const b = document.createElement("option");
  b.value = "b";
  select.append(a, b);
  document.body.appendChild(select);
  await flush();

  select.value = "b";
  interact(select, "reset");
  assert.equal(select.value, "a");
});

test("reset on an output returns to its authored text", async () => {
  const output = hostElement("output", { implements: "modifiable" }) as HTMLOutputElement;
  output.textContent = "42";
  document.body.appendChild(output);
  await flush();

  interact(output, "set", "6");
  interact(output, "reset");
  assert.equal(output.value, "42");
  assert.equal(output.textContent, "42");
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

function numDep(id: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.id = id;
  input.value = value;
  return input;
}

test("nothing recomputes on connect: an element with no on-load keeps its authored text", async () => {
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-step": "1",
  }) as HTMLOutputElement;
  total.textContent = "42";
  document.body.appendChild(total);
  await flush();
  assert.equal(total.textContent, "42");
});

test("set evaluates an expression against #id references at fire time", async () => {
  const price = numDep("price", "2");
  price.setAttribute("on-input", "#total.set(#price.value * #qty.value + 1)");
  const qty = numDep("qty", "3");
  const total = hostElement("output", {
    implements: "modifiable",
    id: "total",
    "on-load": "this.set(#price.value * #qty.value + 1)",
  }) as HTMLOutputElement;
  document.body.append(price, qty, total);
  await flush();

  assert.equal(total.textContent, "7");

  price.value = "4";
  price.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "13");
});

test("this.set(this.value * 2) reads the element's own number value", async () => {
  const self = hostElement("input", {
    implements: "modifiable",
    type: "number",
    value: "21",
    "on-click": "this.set(this.value * 2)",
  }) as HTMLInputElement;
  document.body.appendChild(self);
  await flush();

  assert.equal(self.value, "21", "nothing recomputes on connect");

  self.dispatchEvent(new MouseEvent("click"));
  assert.equal(self.value, "42");
});

test("set(expr) writes the derived value without dispatching a synthetic input event", async () => {
  const total = hostElement("output", {
    implements: "modifiable",
    "on-click": "this.set(1 + 1)",
  }) as HTMLOutputElement;
  document.body.appendChild(total);
  await flush();

  let inputs = 0;
  total.addEventListener("input", () => inputs++);
  total.dispatchEvent(new MouseEvent("click"));
  assert.equal(total.textContent, "2");
  assert.equal(inputs, 0);
});

test("set(sum('.amount')) adds matched elements and set(count('.amount')) counts them", async () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<input class="amount" type="number" value="2.5"><input class="amount" type="number" value="3.25">';
  const total = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(sum('.amount'))",
  }) as HTMLOutputElement;
  const tally = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(count('.amount'))",
  }) as HTMLOutputElement;
  document.body.append(root, total, tally);
  await flush();

  assert.equal(total.textContent, "5.75");
  assert.equal(tally.textContent, "2");
});

test("expressions support parentheses, unary minus and min/max/floor/ceil/round", async () => {
  const a = numDep("a", "1");
  const b = numDep("b", "5");
  const out = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(min(#a.value, #b.value) + round(2.6) * floor(2.7) - (1 + 1))",
  }) as HTMLOutputElement;
  document.body.append(a, b, out);
  await flush();

  assert.equal(out.textContent, "5");

  const neg = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(-#a.value + 10)",
  }) as HTMLOutputElement;
  document.body.appendChild(neg);
  await flush();
  assert.equal(neg.textContent, "9");
});

test("a malformed expression is a trigger parse error reported once, never at fire time", async (t) => {
  const error = t.mock.method(console, "error");
  const out = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(1 +)",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();

  assert.equal(out.textContent, "");
  const messages = error.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(
    messages.some(
      (message) => message.includes("invalid phrase") && message.includes("expression at position 0"),
    ),
    messages.join(" | "),
  );
  assert.equal(
    messages.filter((message) => message.includes("expression at position 0")).length,
    1,
    "the parse error is reported once per attribute string",
  );
});

test("a fire-time expression error fails the unit and leaves the element untouched", async (t) => {
  const error = t.mock.method(console, "error");
  const out = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(#ghost.value * 2)",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();

  assert.equal(out.textContent, "", "a failed expression is a failed unit: nothing is written");
  assert.equal(error.mock.callCount(), 1);
  assert.ok(String(error.mock.calls[0]!.arguments[0]).includes("#ghost"));
});

test("a division by zero is a fire-time error, not a fallback", async (t) => {
  const error = t.mock.method(console, "error");
  const out = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(1 / 0)",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();

  assert.equal(out.textContent, "", "nothing is written");
  assert.equal(error.mock.callCount(), 1);
  assert.ok(String(error.mock.calls[0]!.arguments[0]).includes("divided by zero"));
});

