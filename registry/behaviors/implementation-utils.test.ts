import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "../../tests/jsdom.ts";
import { bindEvents, NotReadyError, valueOf } from "./implementation-utils.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("valueOf reads .value first, then data-value, then textContent", () => {
  const byValue = document.createElement("div") as unknown as { value: number };
  byValue.value = 5;
  assert.equal(valueOf(byValue as unknown as Element), 5);

  const byStringValue = document.createElement("div") as unknown as { value: string };
  byStringValue.value = "7";
  assert.equal(valueOf(byStringValue as unknown as Element), 7);

  const byDataset = document.createElement("div");
  byDataset.dataset["value"] = "11";
  assert.equal(valueOf(byDataset), 11);

  const byText = document.createElement("div");
  byText.textContent = "42";
  assert.equal(valueOf(byText), 42);

  const empty = document.createElement("div");
  assert.equal(valueOf(empty), 0);
});

test("bindEvents binds one listener per entry, filters event:key pairs, and updates live", () => {
  const el = document.createElement("div");
  const seen: string[] = [];
  let list = "click, keydown:enter";
  const bound = bindEvents(el, () => list, (e) => {
    seen.push(e.type);
  });

  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
  assert.deepEqual(seen, ["click", "keydown"]);

  list = "input";
  bound.update();
  el.dispatchEvent(new Event("input"));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(seen, ["click", "keydown", "input"]);
});

test("bindEvents dispose removes the listeners", () => {
  const el = document.createElement("div");
  let fired = 0;
  const bound = bindEvents(el, () => "click", () => {
    fired++;
  });
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(fired, 1);
  bound.dispose();
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(fired, 1);
});

test("NotReadyError describes the loading gap distinctly from a missing implementation", () => {
  const error = new NotReadyError("requestable", "send");
  assert.equal(error.name, "NotReadyError");
  assert.ok(error instanceof Error);
  assert.match(error.message, /implements "requestable" still loading/);
  assert.match(error.message, /send\(\) dropped/);
});