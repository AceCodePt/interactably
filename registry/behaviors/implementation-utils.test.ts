import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { bindEvents, NotReadyError, readValue } from "@behaviors/implementation-utils.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("readValue dispatches on the element's declared type", () => {
  const formatted = document.createElement("div");
  formatted.textContent = "$42.00";
  formatted.setAttribute("formattable-value", "42");
  formatted.setAttribute("formattable-format", "{ style: 'currency', currency: 'USD' }");
  assert.equal(readValue(formatted), 42);

  const dated = document.createElement("div");
  dated.textContent = "Jan 2, 2024";
  dated.setAttribute("formattable-value", "2024-01-02");
  dated.setAttribute("formattable-format", "{ type: 'date', dateStyle: 'medium' }");
  assert.equal(readValue(dated), "Jan 2, 2024");

  const numeric = document.createElement("input");
  numeric.type = "number";
  numeric.value = "42";
  assert.equal(readValue(numeric), 42);

  const words = document.createElement("input");
  words.value = "abc";
  assert.equal(readValue(words), "abc");

  const textNumeric = document.createElement("input");
  textNumeric.value = "05";
  assert.equal(readValue(textNumeric), "05");

  const emptyNumber = document.createElement("input");
  emptyNumber.type = "number";
  emptyNumber.value = "";
  assert.equal(readValue(emptyNumber), "");

  const checked = document.createElement("input");
  checked.type = "checkbox";
  checked.checked = true;
  assert.equal(readValue(checked), true);
  assert.equal(readValue(checked, "checked"), true);

  const byText = document.createElement("div");
  byText.textContent = "7";
  assert.equal(readValue(byText), "7");
  assert.equal(readValue(byText, "checked"), false);
});

test("readValue reads min/max/step typed by the element", () => {
  const bounded = document.createElement("input");
  bounded.type = "number";
  bounded.min = "2";
  bounded.max = "10";
  assert.equal(readValue(bounded, "min"), 2);
  assert.equal(readValue(bounded, "max"), 10);

  const stepped = document.createElement("input");
  stepped.type = "number";
  stepped.step = "5";
  assert.equal(readValue(stepped, "step"), 5);

  const range = document.createElement("input");
  range.type = "range";
  assert.equal(readValue(range, "min"), "");
  assert.equal(readValue(range, "max"), "");
  assert.equal(readValue(range, "step"), 1, "absent step on number/range is the platform default");

  const unparseable = document.createElement("input");
  unparseable.type = "number";
  Object.defineProperty(unparseable, "min", { value: "abc", configurable: true });
  assert.ok(Number.isNaN(readValue(unparseable, "min") as number), "a malformed bound reads NaN");

  const dated = document.createElement("input");
  dated.type = "date";
  dated.setAttribute("min", "2024-01-01");
  dated.setAttribute("step", "7");
  assert.equal(readValue(dated, "min"), "2024-01-01", "a date bound is the string as written");
  assert.equal(readValue(dated, "step"), "7");

  const text = document.createElement("input");
  text.setAttribute("step", "any");
  assert.equal(readValue(text, "step"), "any");

  const bare = document.createElement("span");
  assert.equal(readValue(bare, "min"), "", "an element without the attribute reads empty");
  assert.equal(readValue(bare, "step"), "");
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

test("bindEvents filters a code entry against KeyboardEvent.code, not key", () => {
  const el = document.createElement("div");
  const seen: string[] = [];
  const bound = bindEvents(el, () => "keydown:code:KeyA", (e) => {
    seen.push((e as KeyboardEvent).code);
  });

  el.dispatchEvent(new KeyboardEvent("keydown", { key: "q", code: "KeyA" }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyB" }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  assert.deepEqual(seen, ["KeyA"], "only the matching code fires; key is not consulted");
  bound.dispose();
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