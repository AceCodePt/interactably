import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";
import type { InteractionEvent } from "../../interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("../../interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("./summable.ts");
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

function interact(el: Element, verb: string, arg: unknown): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("sum adds the matched elements and writes textContent and data-value", async () => {
  const total = hostElement("output", { implements: "summable", "summable-precision": "2" }) as HTMLOutputElement;
  const root = document.createElement("div");
  const a = document.createElement("input");
  a.value = "2.5";
  const b = document.createElement("input");
  b.value = "3.25";
  root.append(a, b);
  document.body.append(total, root);
  await flush();

  interact(total, "sum", { root, select: "input" });
  assert.equal(total.textContent, "5.75");
  assert.equal(total.dataset["value"], "5.75");
});

test("summable-precision controls the decimal places; the data-value keeps the raw total", async () => {
  const total = hostElement("output", { implements: "summable" }) as HTMLOutputElement;
  const root = document.createElement("div");
  const a = document.createElement("input");
  a.value = "1.006";
  root.appendChild(a);
  document.body.append(total, root);
  await flush();

  interact(total, "sum", { root, select: "input" });
  assert.equal(total.textContent, "1.01");
  assert.equal(total.dataset["value"], "1.006");

  const rounded = hostElement("output", { implements: "summable", "summable-precision": "0" }) as HTMLOutputElement;
  document.body.appendChild(rounded);
  await flush();
  interact(rounded, "sum", { root, select: "input" });
  assert.equal(rounded.textContent, "1");
});

test("reads numbers through valueOf: .value, then data-value, then textContent", async () => {
  const total = hostElement("output", { implements: "summable" }) as HTMLOutputElement;
  const root = document.createElement("div");
  const byValue = document.createElement("input");
  byValue.value = "4";
  const byDataset = document.createElement("span");
  byDataset.dataset["value"] = "6";
  const byText = document.createElement("span");
  byText.textContent = "2";
  const blank = document.createElement("span");
  root.append(byValue, byDataset, byText, blank);
  document.body.append(total, root);
  await flush();

  interact(total, "sum", { root, select: "span, input" });
  assert.equal(total.textContent, "12.00");
  assert.equal(total.dataset["value"], "12");
});

test("attaches to span and td", async () => {
  const root = document.createElement("div");
  const input = document.createElement("input");
  input.value = "7";
  root.appendChild(input);

  const span = hostElement("span", { implements: "summable" }) as HTMLSpanElement;
  const td = hostElement("td", { implements: "summable" }) as HTMLTableCellElement;
  document.body.append(span, td, root);
  await flush();

  interact(span, "sum", { root, select: "input" });
  assert.equal(span.textContent, "7.00");

  interact(td, "sum", { root, select: "input" });
  assert.equal(td.textContent, "7.00");
  assert.equal(td.dataset["value"], "7");
});