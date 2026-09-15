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

function dep(id: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.value = value;
  return input;
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

test("modifiable-formula evaluates against #id references at fire time", async () => {
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

test("compute writes the derived value without dispatching a synthetic input event", async () => {
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "1 + 1",
  }) as HTMLOutputElement;
  document.body.appendChild(total);
  await flush();

  let inputs = 0;
  total.addEventListener("input", () => inputs++);
  interact(total, "compute");
  assert.equal(total.textContent, "2");
  assert.equal(inputs, 0);
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

test("sum(selector) adds matched elements and count(selector) counts them", async () => {
  const root = document.createElement("div");
  root.innerHTML = '<input class="amount" value="2.5"><input class="amount" value="3.25">';
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "sum('.amount')",
  }) as HTMLOutputElement;
  const tally = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "count('.amount')",
  }) as HTMLOutputElement;
  document.body.append(root, total, tally);
  await flush();

  assert.equal(total.textContent, "5.75");
  assert.equal(total.dataset["value"], "5.75");
  assert.equal(tally.textContent, "2");
});

test("format(value, options) renders through Intl and keeps the raw number in data-value", async () => {
  const root = document.createElement("div");
  root.innerHTML = '<input class="amount" value="2.5"><input class="amount" value="3.25">';
  const total = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "format(sum('.amount'), { style: 'currency', currency: 'USD' })",
  }) as HTMLOutputElement;
  document.body.append(root, total);
  await flush();

  assert.equal(total.textContent, "$5.75");
  assert.equal(total.dataset["value"], "5.75");
});

test("format(value, { type: 'date' }) parses the reference as a date", async () => {
  const joined = dep("joined", "2024-01-02");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "format(#joined, { type: 'date', dateStyle: 'medium' })",
  }) as HTMLOutputElement;
  document.body.append(joined, out);
  await flush();

  assert.equal(out.textContent, "Jan 2, 2024");
});

test("the formula supports parentheses, unary minus and min/max/floor/ceil/round", async () => {
  const a = dep("a", "1");
  const b = dep("b", "5");
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "min(#a, #b) + round(2.6) * floor(2.7) - (1 + 1)",
  }) as HTMLOutputElement;
  document.body.append(a, b, out);
  await flush();

  assert.equal(out.textContent, "5");

  const neg = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "-#a + 10",
  }) as HTMLOutputElement;
  document.body.appendChild(neg);
  await flush();
  assert.equal(neg.textContent, "9");
});

test("a missing #id dependency counts as zero", async () => {
  const out = hostElement("output", {
    implements: "modifiable",
    "modifiable-formula": "#ghost + 5",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();
  assert.equal(out.textContent, "5");
});

test("is() passes when the comparison holds and guards when it fails", async () => {
  const input = hostElement("input", { implements: "modifiable", value: "18" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const pass = interact(input, "is", { op: ">=", value: 18 });
  assert.equal(pass.defaultPrevented, false, "the chain continues when the comparison holds");

  const guard = interact(input, "is", { op: ">", value: 18 });
  assert.equal(guard.defaultPrevented, true, "preventDefault() aborts the chain when the comparison fails");
});

test("is() compares strings with ==", async () => {
  const select = hostElement("select", { implements: "modifiable" }) as HTMLSelectElement;
  const option = document.createElement("option");
  option.value = "yes";
  option.textContent = "yes";
  select.appendChild(option);
  document.body.appendChild(select);
  await flush();

  const pass = interact(select, "is", { op: "==", value: "yes" });
  assert.equal(pass.defaultPrevented, false);

  const guard = interact(select, "is", { op: "==", value: "no" });
  assert.equal(guard.defaultPrevented, true);
});

test("is() reads the current value off an output element", async () => {
  const output = hostElement("output", { implements: "modifiable" }) as HTMLOutputElement;
  output.textContent = "7";
  document.body.appendChild(output);
  await flush();

  const pass = interact(output, "is", { op: ">", value: 5 });
  assert.equal(pass.defaultPrevented, false);

  const guard = interact(output, "is", { op: "<", value: 5 });
  assert.equal(guard.defaultPrevented, true);
});