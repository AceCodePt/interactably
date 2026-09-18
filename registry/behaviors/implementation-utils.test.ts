import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { bindEvents, NotReadyError, readValue, valueOf } from "@behaviors/implementation-utils.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("valueOf reads through readValue: number input, formattable raw, textContent", () => {
  const numberInput = document.createElement("input");
  numberInput.type = "number";
  numberInput.value = "7";
  assert.equal(valueOf(numberInput), 7);

  const textInput = document.createElement("input");
  textInput.value = "7";
  assert.equal(valueOf(textInput), 7);

  const byFormattable = document.createElement("div");
  byFormattable.setAttribute("formattable-value", "7");
  byFormattable.setAttribute("formattable-format", "{ style: 'currency', currency: 'USD' }");
  assert.equal(valueOf(byFormattable), 7);

  const byText = document.createElement("div");
  byText.textContent = "42";
  assert.equal(valueOf(byText), 42);

  const empty = document.createElement("div");
  assert.equal(valueOf(empty), 0);
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