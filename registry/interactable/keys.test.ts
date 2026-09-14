import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesKey } from "@interactable/keys.ts";

function keyEvent(key: string): KeyboardEvent {
  return { key } as KeyboardEvent;
}

test("matches exact KeyboardEvent.key", () => {
  assert.equal(matchesKey(keyEvent("Enter"), "enter"), true);
  assert.equal(matchesKey(keyEvent("Tab"), "tab"), true);
  assert.equal(matchesKey(keyEvent("Escape"), "escape"), true);
  assert.equal(matchesKey(keyEvent("ArrowUp"), "arrowup"), true);
  assert.equal(matchesKey(keyEvent("numpadenter"), "numpadenter"), true);
});

test("matching is case-insensitive on both sides", () => {
  assert.equal(matchesKey(keyEvent("ENTER"), "enter"), true);
  assert.equal(matchesKey(keyEvent("Enter"), "ENTER"), true);
  assert.equal(matchesKey(keyEvent("eScApE"), "escape"), true);
});

test("space means the single space character", () => {
  assert.equal(matchesKey(keyEvent(" "), "space"), true);
  assert.equal(matchesKey(keyEvent(" "), "SPACE"), true);
  assert.equal(matchesKey(keyEvent(" "), " "), true);
});

test("non-matching keys return false", () => {
  assert.equal(matchesKey(keyEvent("Tab"), "enter"), false);
  assert.equal(matchesKey(keyEvent("Enter"), "escape"), false);
  assert.equal(matchesKey(keyEvent(" "), "enter"), false);
});

test("an event without a key never matches", () => {
  assert.equal(matchesKey({} as KeyboardEvent, "enter"), false);
  assert.equal(matchesKey({ key: undefined } as unknown as KeyboardEvent, "enter"), false);
});