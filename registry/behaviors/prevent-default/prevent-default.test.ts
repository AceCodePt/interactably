import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";
import { derivedDefaults } from "./prevent-default.ts";
import { defineInteractableHost } from "../interactable-host.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
  defineInteractableHost("a");
  defineInteractableHost("button");
  defineInteractableHost("div");
  defineInteractableHost("form");
  defineInteractableHost("input");
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

function cancelableEvent(el: Element, type: string, init?: EventInit): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

test("derivedDefaults reads claimed on-* attributes and falls back to the tag", () => {
  const div = document.createElement("div");
  div.setAttribute("on-click", "#x.go()");
  assert.equal(derivedDefaults(div), "click");

  div.setAttribute("on-keydown", "enter: #x.go(); #y.go()");
  assert.equal(derivedDefaults(div), "click,keydown:enter");

  div.setAttribute("on-submit", "#x.go()");
  assert.equal(derivedDefaults(div), "click,keydown:enter,submit");

  div.setAttribute("on-input", "#x.go()");
  assert.equal(derivedDefaults(div), "click,keydown:enter,submit");

  const unkeyed = document.createElement("div");
  unkeyed.setAttribute("on-keydown", "#x.go()");
  assert.equal(derivedDefaults(unkeyed), "");

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

test("prevent-default derives keydown:enter from a keyed on-keydown and leaves other keys alone", async (t) => {
  t.mock.method(console, "error");
  const input = hostElement("input", { implements: "prevent-default", "on-keydown": "enter: #x.go()" });
  document.body.appendChild(input);
  await flush();

  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);

  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  input.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
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

test("prevent-default-events overrides the derivation", async () => {
  const form = hostElement("form", { implements: "prevent-default", "prevent-default-events": "click" });
  document.body.appendChild(form);
  await flush();

  assert.equal(cancelableEvent(form, "submit").defaultPrevented, false);
  assert.equal(cancelableEvent(form, "click").defaultPrevented, true);
});