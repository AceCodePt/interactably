import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/modifiable/modifiable.ts");
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

function dep(id: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.value = value;
  return input;
}

test("compute evaluates the formula against #id references at fire time", async () => {
  const price = dep("price", "2");
  const qty = dep("qty", "3");
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "#price * #qty + 1",
  }) as HTMLOutputElement;
  document.body.append(price, qty, total);
  await flush();

  assert.equal(total.textContent, "7");
  assert.equal(total.dataset["value"], "7");

  price.value = "4";
  interact(total, "compute");
  assert.equal(total.textContent, "13");
  assert.equal(total.dataset["value"], "13");
});

test("supports parentheses, unary minus and min/max/floor/ceil/round", async () => {
  const a = dep("a", "1");
  const b = dep("b", "5");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "min(#a, #b) + round(2.6) * floor(2.7) - (1 + 1)",
  }) as HTMLOutputElement;
  document.body.append(a, b, out);
  await flush();

  assert.equal(out.textContent, "5");
  assert.equal(out.dataset["value"], "5");

  const neg = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "-#a + 10",
  }) as HTMLOutputElement;
  document.body.appendChild(neg);
  await flush();
  assert.equal(neg.textContent, "9");
});

test("a missing #id reference counts as zero in arithmetic", async () => {
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "#ghost + 5",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();
  assert.equal(out.textContent, "5");
});

test("sum(selector) totals the matched elements at fire time", async () => {
  const amounts = [dep("amt1", "2.5"), dep("amt2", "3.25")];
  for (const amount of amounts) amount.className = "amount";
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "sum('input.amount')",
  }) as HTMLOutputElement;
  document.body.append(...amounts, total);
  await flush();

  assert.equal(total.textContent, "5.75");
  assert.equal(total.dataset["value"], "5.75");

  amounts[1]!.value = "10";
  interact(total, "compute");
  assert.equal(total.textContent, "12.5");
});

test("count(selector) returns the number of matched elements", async () => {
  const list = document.createElement("ul");
  list.id = "rows";
  for (let i = 0; i < 3; i++) {
    const li = document.createElement("li");
    list.appendChild(li);
  }
  const counter = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "count('#rows > li')",
  }) as HTMLOutputElement;
  document.body.append(list, counter);
  await flush();

  assert.equal(counter.textContent, "3");
  assert.equal(counter.dataset["value"], "3");

  const li = document.createElement("li");
  list.appendChild(li);
  interact(counter, "compute");
  assert.equal(counter.textContent, "4");
});

test("format(value, { style: 'currency', currency: 'USD' }) formats and keeps data-value numeric", async () => {
  const amount = dep("amount", "2.5");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "format(#amount, { style: 'currency', currency: 'USD' })",
  }) as HTMLOutputElement;
  document.body.append(amount, out);
  await flush();

  assert.equal(out.textContent, "$2.50");
  assert.equal(out.dataset["value"], "2.5");

  amount.value = "12.5";
  interact(out, "compute");
  assert.equal(out.textContent, "$12.50");
  assert.equal(out.dataset["value"], "12.5");
});

test("format passes Intl options through, e.g. maximumFractionDigits", async () => {
  const amount = dep("amount", "1.006");
  const rounded = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "format(#amount, { maximumFractionDigits: 2 })",
  }) as HTMLOutputElement;
  document.body.append(amount, rounded);
  await flush();
  assert.equal(rounded.textContent, "1.01");
});

test("format(value, { type: 'date', dateStyle: 'medium' }) formats a date", async () => {
  const date = dep("date", "2024-01-15");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "format(#date, { type: 'date', dateStyle: 'medium' })",
  }) as HTMLOutputElement;
  document.body.append(date, out);
  await flush();

  assert.equal(out.textContent, "Jan 15, 2024");
  assert.equal(out.dataset["value"], undefined);
});

test("a malformed formula writes the modifiable-invalid-value fallback", async () => {
  const fallback = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "1 +",
    "modifiable-invalid-value": "0",
  }) as HTMLOutputElement;
  const defaulted = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "1 +",
  }) as HTMLOutputElement;
  document.body.append(fallback, defaulted);
  await flush();

  assert.equal(fallback.textContent, "0");
  assert.equal(defaulted.textContent, "Error");
});

test("compute writes the result and data-value without dispatching a synthetic input event", async () => {
  const a = dep("a", "2");
  const b = dep("b", "3");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "#a * #b",
  }) as HTMLOutputElement;
  document.body.append(a, b, out);
  await flush();

  let inputs = 0;
  out.addEventListener("input", () => inputs++);

  assert.equal(out.textContent, "6");
  assert.equal(out.dataset["value"], "6");
  assert.equal(inputs, 0);

  a.value = "4";
  interact(out, "compute");
  assert.equal(out.textContent, "12");
  assert.equal(out.dataset["value"], "12");
  assert.equal(inputs, 0);
});