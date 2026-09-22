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
  await import("@behaviors/focusable/focusable.ts");
  await import("@behaviors/prevent-default/prevent-default.ts");
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

function hostElement<T extends HTMLElement>(tag: string, attributes: Record<string, string>): T {
  const el = document.createElement(tag) as T;
  el.setAttribute("implements", "focusable");
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

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  assert.ok(el !== null, `#${id} exists`);
  return el;
}

function captureErrors(): { errors: string[]; restore: () => void } {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  return { errors, restore: () => (console.error = original) };
}

function keydown(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function rovingOptions(ids: string[], searchId: string): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.id = "results";
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]!;
    const li = document.createElement("li");
    li.id = id;
    li.tabIndex = -1;
    li.setAttribute("implements", "focusable prevent-default");
    const next = ids[(index + 1) % ids.length]!;
    const prev = index === 0 ? searchId : ids[index - 1]!;
    li.setAttribute("on-keydown", `arrowdown: #${next}.focus(); arrowup: #${prev}.focus()`);
    li.textContent = id;
    ul.appendChild(li);
  }
  return ul;
}

function combobox(optionIds: string[]): HTMLInputElement {
  const search = document.createElement("input");
  search.id = "search";
  search.setAttribute("implements", "focusable prevent-default");
  search.setAttribute("on-keydown", "arrowdown: #results-1.focus()");
  document.body.append(search, rovingOptions(optionIds, "search"));
  return search;
}

test("focus() moves DOM focus onto a button", async () => {
  const b = hostElement<HTMLButtonElement>("button", { id: "b" });
  document.body.appendChild(b);
  await flush();

  interact(b, "focus");
  assert.equal(document.activeElement, b);
});

test("focus() moves DOM focus onto a tabindex=-1 li", async () => {
  const i = hostElement<HTMLLIElement>("li", { id: "i", tabindex: "-1" });
  document.body.appendChild(i);
  await flush();

  interact(i, "focus");
  assert.equal(document.activeElement, i);
});

test("focus() on an unfocusable li reports once per element and moves nothing", async () => {
  const { errors, restore } = captureErrors();
  try {
    const i = hostElement<HTMLLIElement>("li", { id: "i" });
    document.body.appendChild(i);
    await flush();
    const before = document.activeElement;

    interact(i, "focus");
    assert.equal(document.activeElement, before, "a silent focus() on a plain li moves nothing");
    assert.equal(errors.filter((m) => m.includes("did not take")).length, 1, "the first miss reports once");
    assert.ok(errors.some((m) => m.includes("did not take")), "the report names the failure");

    interact(i, "focus");
    assert.equal(errors.filter((m) => m.includes("did not take")).length, 1, "a repeat on the same element logs nothing more");

    const j = hostElement<HTMLLIElement>("li", { id: "j" });
    document.body.appendChild(j);
    await flush();
    interact(j, "focus");
    assert.equal(errors.filter((m) => m.includes("did not take")).length, 2, "a different element logs once more");
  } finally {
    restore();
  }
});

test("blur() clears focus and never logs", async () => {
  const { errors, restore } = captureErrors();
  try {
    const b = hostElement<HTMLButtonElement>("button", { id: "b" });
    document.body.appendChild(b);
    await flush();

    interact(b, "focus");
    assert.equal(document.activeElement, b);

    interact(b, "blur");
    assert.equal(document.activeElement, document.body, "blur returns focus to the body");

    const i = hostElement<HTMLLIElement>("li", { id: "i" });
    document.body.appendChild(i);
    await flush();
    interact(i, "blur");
    assert.equal(document.activeElement, document.body, "blur on an unfocused element changes nothing");
    assert.deepEqual(errors, [], "blur never logs");
  } finally {
    restore();
  }
});

test("keyed ArrowDown/ArrowUp rove focus through the combobox options", async () => {
  const search = combobox(["results-1", "results-2", "results-3"]);
  await flush();

  keydown(search, "ArrowDown");
  assert.equal(document.activeElement, byId("results-1"));

  keydown(byId("results-1"), "ArrowDown");
  assert.equal(document.activeElement, byId("results-2"));

  keydown(byId("results-2"), "ArrowDown");
  assert.equal(document.activeElement, byId("results-3"));

  keydown(byId("results-3"), "ArrowDown");
  assert.equal(document.activeElement, byId("results-1"), "the wrap is whatever the last option's phrase points at");

  keydown(byId("results-1"), "ArrowUp");
  assert.equal(document.activeElement, byId("search"), "ArrowUp on the first option returns to the input");

  keydown(byId("search"), "ArrowLeft");
  assert.equal(document.activeElement, byId("search"), "a keyed phrase does not fire on another key");
});

test("a wholesale list re-fill re-focuses the new positional first option", async () => {
  const search = combobox(["results-1", "results-2"]);
  await flush();

  keydown(search, "ArrowDown");
  const oldFirst = byId("results-1");
  assert.equal(document.activeElement, oldFirst);

  byId("results").replaceWith(rovingOptions(["results-1", "results-2"], "search"));
  await flush();
  const newFirst = byId("results-1");
  assert.notEqual(newFirst, oldFirst, "the list was replaced wholesale");

  keydown(search, "ArrowDown");
  assert.equal(document.activeElement, newFirst, "ArrowDown focuses the new first option after the re-fill");
});