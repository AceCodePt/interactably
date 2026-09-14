import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/listable/listable.ts");
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

test("removeRow removes the row containing the argument, from inside it or as the row itself", async () => {
  const list = hostElement("ul", { implements: "listable" }) as HTMLUListElement;
  const row1 = document.createElement("li");
  const button = document.createElement("button");
  row1.appendChild(button);
  const row2 = document.createElement("li");
  list.append(row1, row2);
  document.body.appendChild(list);
  await flush();

  interact(list, "removeRow", button);
  assert.deepEqual([...list.children].length, 1);
  assert.equal(list.children[0], row2);

  interact(list, "removeRow", row2);
  assert.deepEqual([...list.children].length, 0);
});

test("removeRow never takes the list below min-rows", async () => {
  const list = hostElement("ul", { implements: "listable", "listable-min-rows": "1" }) as HTMLUListElement;
  const row1 = document.createElement("li");
  const row2 = document.createElement("li");
  const row3 = document.createElement("li");
  list.append(row1, row2, row3);
  document.body.appendChild(list);
  await flush();

  interact(list, "removeRow", row1);
  assert.equal(list.children.length, 2);
  interact(list, "removeRow", row2);
  assert.equal(list.children.length, 1);
  interact(list, "removeRow", row3);
  assert.equal(list.children.length, 1);
});

test("adopt clones the template content into the list", async () => {
  const list = hostElement("ul", { implements: "listable" }) as HTMLUListElement;
  const template = document.createElement("template");
  template.innerHTML = "<li><input></li><li></li>";
  document.body.append(list, template);
  await flush();

  interact(list, "adopt", template);
  assert.equal(list.children.length, 2);
  assert.equal(list.querySelector("li input") !== null, true);

  interact(list, "adopt", template);
  assert.equal(list.children.length, 4);
});

test("clear removes rows down to min-rows", async () => {
  const list = hostElement("ul", { implements: "listable", "listable-min-rows": "2" }) as HTMLUListElement;
  list.append(document.createElement("li"), document.createElement("li"), document.createElement("li"));
  document.body.appendChild(list);
  await flush();

  interact(list, "clear");
  assert.equal(list.children.length, 2);

  interact(list, "clear");
  assert.equal(list.children.length, 2);
});

test("attaches to ol and tbody", async () => {
  const ol = hostElement("ol", { implements: "listable" }) as HTMLOListElement;
  ol.append(document.createElement("li"), document.createElement("li"));
  document.body.appendChild(ol);
  await flush();

  interact(ol, "removeRow", ol.children[0]!);
  assert.equal(ol.children.length, 1);

  const tbody = hostElement("tbody", { implements: "listable" }) as HTMLTableSectionElement;
  const table = document.createElement("table");
  table.appendChild(tbody);
  tbody.append(document.createElement("tr"), document.createElement("tr"));
  document.body.appendChild(table);
  await flush();

  interact(tbody, "removeRow", tbody.children[0]!);
  assert.equal(tbody.children.length, 1);
});