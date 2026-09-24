import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let derivedDefaults: typeof import("@behaviors/prevent-default/prevent-default.ts").derivedDefaults;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/prevent-default/prevent-default.ts");
  ({ derivedDefaults } = await import("@behaviors/prevent-default/prevent-default.ts"));
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

function fromMarkup(html: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.firstElementChild as HTMLElement;
}

function cancelableEvent(el: Element, type: string, init?: EventInit): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

test("derivedDefaults reads claimed on-* attributes and falls back to the tag", () => {
  const div = fromMarkup('<div on-click="#x.go()" on-submit="#x.go()" on-input="#x.go()"></div>');
  assert.equal(derivedDefaults(div), "click,submit");

  const keyed = fromMarkup('<div on-click="#x.go()" on-keydown(key:`Enter`)="#x.go(); #y.go()"></div>');
  assert.equal(derivedDefaults(keyed), "click,keydown:enter");

  const coded = fromMarkup('<div on-keydown(code:`KeyA`)="#x.go()"></div>');
  assert.equal(derivedDefaults(coded), "keydown:code:keya");

  const unkeyed = fromMarkup('<div on-keydown="#x.go()"></div>');
  assert.equal(derivedDefaults(unkeyed), "");

  const typed = fromMarkup('<div on-keydown(key:string)="#x.go()"></div>');
  assert.equal(derivedDefaults(typed), "", "a type declaration binds, it does not derive a claim");

  const form = document.createElement("form");
  assert.equal(derivedDefaults(form), "submit");

  const link = document.createElement("a");
  link.setAttribute("href", "/docs");
  assert.equal(derivedDefaults(link), "click");

  const noHref = document.createElement("a");
  assert.equal(derivedDefaults(noHref), "");

  const button = document.createElement("button");
  assert.equal(derivedDefaults(button), "click");

  const plain = document.createElement("div");
  assert.equal(derivedDefaults(plain), "");
});

test("prevent-default cancels the derived submit on a form", async () => {
  const form = hostElement("form", { implements: "prevent-default" });
  document.body.appendChild(form);
  await flush();

  assert.equal(cancelableEvent(form, "submit").defaultPrevented, true);
});

test("prevent-default derives submit from a claimed on-submit", async (t) => {
  t.mock.method(console, "error");
  const form = hostElement("form", { implements: "prevent-default", "on-submit": "#x.go()" });
  document.body.appendChild(form);
  await flush();

  assert.equal(cancelableEvent(form, "submit").defaultPrevented, true);
});

test("prevent-default derives keydown:enter from a key literal and leaves other keys alone", async (t) => {
  t.mock.method(console, "error");
  const input = fromMarkup('<input implements="prevent-default" on-keydown(key:`Enter`)="#x.go()">');
  document.body.appendChild(input);
  await flush();

  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);

  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  input.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
});

test("prevent-default derives a code claim that matches code, not key", async (t) => {
  t.mock.method(console, "error");
  const input = fromMarkup('<input implements="prevent-default" on-keydown(code:`KeyA`)="#x.go()">');
  document.body.appendChild(input);
  await flush();

  const wrongCode = new KeyboardEvent("keydown", { key: "a", code: "KeyB", bubbles: true, cancelable: true });
  input.dispatchEvent(wrongCode);
  assert.equal(wrongCode.defaultPrevented, false, "the claim matches code, so key alone is not enough");

  const rightCode = new KeyboardEvent("keydown", { key: "q", code: "KeyA", bubbles: true, cancelable: true });
  input.dispatchEvent(rightCode);
  assert.equal(rightCode.defaultPrevented, true, "the derived code claim cancels exactly its code");
});

test("an unkeyed on-keydown contributes nothing and prevent-default warns that it has no effect", async (t) => {
  const warn = t.mock.method(console, "warn");
  t.mock.method(console, "error");
  const div = hostElement("div", { implements: "prevent-default", "on-keydown": "#x.go()" });
  document.body.appendChild(div);
  await flush();

  assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("no events derived")));

  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  div.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, false);
});

test("events outside submit/click/keydown are not derived and prevent-default warns", async (t) => {
  const warn = t.mock.method(console, "warn");
  t.mock.method(console, "error");
  const div = hostElement("div", { implements: "prevent-default", "on-input": "#x.go()" });
  document.body.appendChild(div);
  await flush();

  assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("no events derived")));
  assert.equal(cancelableEvent(div, "input").defaultPrevented, false);
});

test("prevent-default falls back to the tag: form→submit, <a href>→click, button→click", async () => {
  const form = hostElement("form", { implements: "prevent-default" });
  document.body.appendChild(form);
  await flush();
  assert.equal(cancelableEvent(form, "submit").defaultPrevented, true);

  const link = hostElement("a", { implements: "prevent-default", href: "/docs" });
  document.body.appendChild(link);
  await flush();
  assert.equal(cancelableEvent(link, "click").defaultPrevented, true);

  const button = hostElement("button", { implements: "prevent-default" });
  document.body.appendChild(button);
  await flush();
  assert.equal(cancelableEvent(button, "click").defaultPrevented, true);
});

test("a DOM move re-binds the cancel listeners", async () => {
  const form = hostElement("form", { implements: "prevent-default" });
  document.body.appendChild(form);
  await flush();

  assert.equal(cancelableEvent(form, "submit").defaultPrevented, true);

  form.remove();
  await flush();
  assert.equal(cancelableEvent(form, "submit").defaultPrevented, false);

  document.body.appendChild(form);
  await flush();
  assert.equal(cancelableEvent(form, "submit").defaultPrevented, true);
});

test("prevent-default-events overrides the derivation", async () => {
  const form = hostElement("form", { implements: "prevent-default", "prevent-default-events": "click" });
  document.body.appendChild(form);
  await flush();

  assert.equal(cancelableEvent(form, "submit").defaultPrevented, false);
  assert.equal(cancelableEvent(form, "click").defaultPrevented, true);
});