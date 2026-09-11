import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_EVENTS_WITHOUT_IDL } from "./events.ts";

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