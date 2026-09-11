import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";

let dom: JSDOM;

before(async () => {
  dom = setupJsdom();
  await import("./paste-transform.ts");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function pasteInput(): HTMLInputElement {
  const el = document.createElement("input", { is: "interactable-input" }) as HTMLInputElement;
  el.setAttribute("implements", "paste-transform");
  return el;
}

function paste(target: HTMLInputElement | HTMLTextAreaElement, text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text" ? text : "") },
  });
  target.dispatchEvent(event);
  return event;
}

test("paste-transform rewrites pasted text through its patterns", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-patterns", "-,_");
  el.setAttribute("paste-transform-replaces", " , ");
  el.value = "foo-bar_baz";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  const event = paste(el, "foo-bar_baz");
  assert.equal(el.value, "foo bar baz");
  assert.equal(event.defaultPrevented, true);
});

test("paste-transform replaces only the selected range", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-patterns", "-,_");
  el.setAttribute("paste-transform-replaces", " ");
  el.value = "a-b c_d";
  el.setSelectionRange(0, 3);
  document.body.appendChild(el);
  await flush();

  paste(el, "x-y");
  assert.equal(el.value, "x y c_d");
});

test("paste-transform works on a textarea", async () => {
  const el = document.createElement("textarea", { is: "interactable-textarea" }) as HTMLTextAreaElement;
  el.setAttribute("implements", "paste-transform");
  el.setAttribute("paste-transform-patterns", "\\n");
  el.setAttribute("paste-transform-replaces", " ");
  el.value = "one\ntwo";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  paste(el, "one\ntwo");
  assert.equal(el.value, "one two");
});

test("paste-transform leaves the paste alone when nothing matches", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-patterns", "x");
  el.setAttribute("paste-transform-replaces", "y");
  el.value = "abc";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  const event = paste(el, "abc");
  assert.equal(el.value, "abc");
  assert.equal(event.defaultPrevented, false);
});

test("paste-transform does nothing without patterns or replaces", async () => {
  const el = pasteInput();
  el.value = "abc";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  const event = paste(el, "abc");
  assert.equal(el.value, "abc");
  assert.equal(event.defaultPrevented, false);
});