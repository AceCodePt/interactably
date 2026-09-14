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
  await import("@behaviors/compute/compute.ts");
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
    implements: "compute",
    "compute-formula": "#price * #qty + 1",
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

test("compute-precision rounds the result", async () => {
  const a = dep("a", "1.006");
  const rounded = hostElement("output", {
    implements: "compute",
    "compute-formula": "#a * 1",
    "compute-precision": "2",
  }) as HTMLOutputElement;
  const exact = hostElement("output", {
    implements: "compute",
    "compute-formula": "#a * 1",
  }) as HTMLOutputElement;
  document.body.append(a, rounded, exact);
  await flush();

  assert.equal(rounded.textContent, "1.01");
  assert.equal(exact.textContent, "1.006");
});

test("supports parentheses, unary minus and min/max/floor/ceil/round", async () => {
  const a = dep("a", "1");
  const b = dep("b", "5");
  const out = hostElement("output", {
    implements: "compute",
    "compute-formula": "min(#a, #b) + round(2.6) * floor(2.7) - (1 + 1)",
  }) as HTMLOutputElement;
  document.body.append(a, b, out);
  await flush();

  assert.equal(out.textContent, "5");
  assert.equal(out.dataset["value"], "5");

  const neg = hostElement("output", {
    implements: "compute",
    "compute-formula": "-#a + 10",
  }) as HTMLOutputElement;
  document.body.appendChild(neg);
  await flush();
  assert.equal(neg.textContent, "9");
});

test("a missing dependency counts as zero", async () => {
  const out = hostElement("output", {
    implements: "compute",
    "compute-formula": "#ghost + 5",
  }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();
  assert.equal(out.textContent, "5");
});

test("a malformed formula writes the invalid-value fallback", async () => {
  const fallback = hostElement("output", {
    implements: "compute",
    "compute-formula": "1 +",
    "compute-invalid-value": "0",
  }) as HTMLOutputElement;
  const defaulted = hostElement("output", {
    implements: "compute",
    "compute-formula": "1 +",
  }) as HTMLOutputElement;
  document.body.append(fallback, defaulted);
  await flush();

  assert.equal(fallback.textContent, "0");
  assert.equal(defaulted.textContent, "Error");
});