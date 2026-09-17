import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/paste-transform/paste-transform.ts");
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

function pasteInput(): HTMLInputElement {
  const el = document.createElement("input") as HTMLInputElement;
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

test("paste-transform rewrites pasted text through its pattern", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-pattern", "[-_]");
  el.setAttribute("paste-transform-replace", " ");
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
  el.setAttribute("paste-transform-pattern", "[-_]");
  el.setAttribute("paste-transform-replace", " ");
  el.value = "a-b c_d";
  el.setSelectionRange(0, 3);
  document.body.appendChild(el);
  await flush();

  paste(el, "x-y");
  assert.equal(el.value, "x y c_d");
});

test("paste-transform works on a textarea", async () => {
  const el = document.createElement("textarea") as HTMLTextAreaElement;
  el.setAttribute("implements", "paste-transform");
  el.setAttribute("paste-transform-pattern", "\\n");
  el.setAttribute("paste-transform-replace", " ");
  el.value = "one\ntwo";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  paste(el, "one\ntwo");
  assert.equal(el.value, "one two");
});

test("paste-transform leaves the paste alone when nothing matches", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-pattern", "x");
  el.setAttribute("paste-transform-replace", "y");
  el.value = "abc";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  const event = paste(el, "abc");
  assert.equal(el.value, "abc");
  assert.equal(event.defaultPrevented, false);
});

test("paste-transform does nothing without a pattern or replace", async () => {
  const el = pasteInput();
  el.value = "abc";
  el.setSelectionRange(0, el.value.length);
  document.body.appendChild(el);
  await flush();

  const event = paste(el, "abc");
  assert.equal(el.value, "abc");
  assert.equal(event.defaultPrevented, false);
});

test("paste-transform applies a comma-bearing pattern whole, no split", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-pattern", "\\d{1,3}");
  el.setAttribute("paste-transform-replace", "*");
  el.value = "";
  document.body.appendChild(el);
  await flush();

  paste(el, "12,345");
  assert.equal(el.value, "*,*");
});

test("paste-transform fires one input event like a native paste, and no change", async () => {
  const el = pasteInput();
  el.setAttribute("paste-transform-pattern", "-");
  el.setAttribute("paste-transform-replace", " ");
  el.value = "";
  el.setSelectionRange(0, 0);
  document.body.appendChild(el);
  await flush();

  const inputs: InputEvent[] = [];
  const changes: Event[] = [];
  el.addEventListener("input", (e) => inputs.push(e as InputEvent));
  el.addEventListener("change", (e) => changes.push(e));

  paste(el, "foo-bar");
  assert.equal(el.value, "foo bar");
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]!.type, "input");
  assert.equal(inputs[0]!.inputType, "insertFromPaste");
  assert.equal(inputs[0]!.data, "foo bar");
  assert.equal(changes.length, 0);
});

test("paste-transform logs an invalid regex once per element across pastes", async (t) => {
  const error = t.mock.method(console, "error");
  const el = pasteInput();
  el.setAttribute("paste-transform-pattern", "[");
  el.setAttribute("paste-transform-replace", "x");
  el.value = "";
  document.body.appendChild(el);
  await flush();

  paste(el, "abc");
  paste(el, "def");
  assert.equal(el.value, "");
  assert.equal(error.mock.callCount(), 1);
  assert.ok(String(error.mock.calls[0]!.arguments[0]).includes("paste-transform invalid regex: ["));
});