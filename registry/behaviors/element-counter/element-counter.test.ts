import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/summable/summable.ts");
  await import("@behaviors/element-counter/element-counter.ts");
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

test("count({root, select}) writes the count to textContent and data-value", async () => {
  const list = document.createElement("ul");
  list.innerHTML = "<li></li><li></li>";
  const counter = hostElement("span", { implements: "element-counter" }) as HTMLSpanElement;
  document.body.append(list, counter);
  await flush();

  interact(counter, "count", { root: list, select: "li" });
  assert.equal(counter.textContent, "2");
  assert.equal(counter.dataset["value"], "2");

  list.appendChild(document.createElement("li"));
  interact(counter, "count", { root: list, select: "li" });
  assert.equal(counter.textContent, "3");
});

test("the verb's selector is scoped to the given root", async () => {
  const root = document.createElement("div");
  root.innerHTML = "<ul><li></li><li></li></ul><p></p>";
  const counter = hostElement("span", { implements: "element-counter" }) as HTMLSpanElement;
  document.body.append(root, counter);
  await flush();

  interact(counter, "count", { root, select: "li" });
  assert.equal(counter.textContent, "2");

  interact(counter, "count", { root, select: ":scope > *" });
  assert.equal(counter.textContent, "2");
});

test("element-counter-root and element-counter-selector render an initial count at connect", async () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = "<li></li><li></li><li></li>";
  const counter = hostElement("span", {
    implements: "element-counter",
    "element-counter-root": "list",
    "element-counter-selector": "li",
  }) as HTMLSpanElement;
  document.body.append(list, counter);
  await flush();

  assert.equal(counter.textContent, "3");
  assert.equal(counter.dataset["value"], "3");
});

test("without the pull config nothing renders at connect; the verb still works", async () => {
  const list = document.createElement("ul");
  list.innerHTML = "<li></li>";
  const counter = hostElement("span", { implements: "element-counter" }) as HTMLSpanElement;
  document.body.append(list, counter);
  await flush();

  assert.equal(counter.textContent, "");
  interact(counter, "count", { root: list, select: "li" });
  assert.equal(counter.textContent, "1");
});