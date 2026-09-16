import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { LEGACY_EVENTS_WITHOUT_IDL, isImplementationEvent } from "@interactable/events.ts";
import { defineImplementation } from "@behaviors/_implementation-definition.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
  defineImplementation(
    "eventful",
    { tags: ["div"], events: ["settled", "boom"], verbs: {} },
    () => ({}),
  );
});

after(() => {
  teardownJsdom(dom);
});

test("the legacy set is exported and is a Set", () => {
  assert.ok(LEGACY_EVENTS_WITHOUT_IDL instanceof Set);
});

test("the set is closed and includes the events named in README §3.1", () => {
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("DOMContentLoaded"), true);
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("compositionstart"), true);
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("compositionupdate"), true);
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("compositionend"), true);
});

test("common IDL-backed events are not in the legacy set", () => {
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("click"), false);
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("input"), false);
  assert.equal(LEGACY_EVENTS_WITHOUT_IDL.has("submit"), false);
});

test("isImplementationEvent reads the element's implements at call time", () => {
  const el = document.createElement("div");
  assert.equal(isImplementationEvent(el, "settled"), false);

  el.setAttribute("implements", "eventful");
  assert.equal(isImplementationEvent(el, "settled"), true);
  assert.equal(isImplementationEvent(el, "boom"), true);
  assert.equal(isImplementationEvent(el, "click"), false);
});

test("isImplementationEvent ignores unknown names and undeclared events", () => {
  const el = document.createElement("div");
  el.setAttribute("implements", "ghost eventful");
  assert.equal(isImplementationEvent(el, "settled"), true);
  assert.equal(isImplementationEvent(el, "nope"), false);
});

test("isImplementationEvent consults the synthetic intersect table as a second source", () => {
  const el = document.createElement("div");
  assert.equal(isImplementationEvent(el, "intersect-enter"), true);
  assert.equal(isImplementationEvent(el, "intersect-leave"), true);
  assert.equal(isImplementationEvent(el, "intersect-half"), true);
  assert.equal(isImplementationEvent(el, "intersect-full"), true);
  assert.equal(isImplementationEvent(el, "intersect"), false);
  assert.equal(isImplementationEvent(el, "click"), false);
});
