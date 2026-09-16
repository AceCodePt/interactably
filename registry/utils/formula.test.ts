import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { evaluateFormula } from "@utils/formula.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

test("#a.value is a number when the text parses, else a string; empty is 0", () => {
  const numeric = document.createElement("input");
  numeric.id = "numeric";
  numeric.value = "42";
  const words = document.createElement("input");
  words.id = "words";
  words.value = "abc";
  const empty = document.createElement("input");
  empty.id = "empty";
  empty.value = "";
  document.body.append(numeric, words, empty);

  const n = evaluateFormula("#numeric.value");
  assert.equal(n.value, 42);
  assert.equal(evaluateFormula("#words.value").value, "abc");
  assert.equal(evaluateFormula("#empty.value").value, 0);
});

test("a missing element referenced by .value is the empty string", () => {
  const result = evaluateFormula("#ghost.value");
  assert.equal(result.value, "");
});

test("#a.checked is the element's checked boolean, false when there is none", () => {
  const on = document.createElement("input");
  on.id = "on";
  on.type = "checkbox";
  on.checked = true;
  const off = document.createElement("input");
  off.id = "off";
  off.type = "checkbox";
  off.checked = false;
  const plain = document.createElement("div");
  plain.id = "plain";
  document.body.append(on, off, plain);

  assert.equal(evaluateFormula("#on.checked").value, "true");
  assert.equal(evaluateFormula("#off.checked").value, "false");
  assert.equal(evaluateFormula("#plain.checked").value, "false");
});

test("a bare reference is a parse error naming the fix", () => {
  const a = document.createElement("input");
  a.id = "a";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a"), /reference #a needs \.value or \.checked/);
  assert.throws(() => evaluateFormula("#a + 1"), /needs \.value or \.checked/);
  assert.throws(() => evaluateFormula("#a.textContent"), /needs \.value or \.checked/);
});

test("+ joins when either side is a string and adds otherwise, left to right", () => {
  assert.equal(evaluateFormula("1 + 2").value, 3);
  assert.equal(evaluateFormula("'a' + 1").value, "a1");
  assert.equal(evaluateFormula("1 + 'a'").value, "1a");
  assert.equal(evaluateFormula("'a' + 1 + 2").value, "a12");
  assert.equal(evaluateFormula("1 + 2 + 'a'").value, "3a");
});

test("a value reference joins through + to build a string", () => {
  const slug = document.createElement("input");
  slug.id = "slug";
  slug.value = "x";
  document.body.appendChild(slug);

  assert.equal(evaluateFormula("'invoice-' + #slug.value + '.pdf'").value, "invoice-x.pdf");
});

test("zip codes: two numeric-looking values add; a leading literal forces a join", () => {
  const zip1 = document.createElement("input");
  zip1.id = "zip1";
  zip1.value = "02134";
  const zip2 = document.createElement("input");
  zip2.id = "zip2";
  zip2.value = "90210";
  document.body.append(zip1, zip2);

  assert.equal(evaluateFormula("#zip1.value + #zip2.value").value, 92344);
  assert.equal(evaluateFormula("'' + #zip1.value + #zip2.value").value, "213490210");
});

test("a boolean is 1 and 0 in arithmetic: the line-item pattern", () => {
  const item = document.createElement("input");
  item.id = "item";
  item.type = "checkbox";
  item.value = "12.99";
  item.checked = true;
  document.body.appendChild(item);

  assert.equal(evaluateFormula("#item.value * #item.checked").value, 12.99);

  item.checked = false;
  assert.equal(evaluateFormula("#item.value * #item.checked").value, 0);
});

test("checked references add as 1/0 and min coerces them", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.type = "checkbox";
  a.checked = true;
  const b = document.createElement("input");
  b.id = "b";
  b.type = "checkbox";
  b.checked = false;
  document.body.append(a, b);

  assert.equal(evaluateFormula("#a.checked + #b.checked").value, 1);
  assert.equal(evaluateFormula("min(#a.checked, 5)").value, 1);
  assert.equal(evaluateFormula("min(#b.checked, 5)").value, 0);

  a.checked = false;
  assert.equal(evaluateFormula("#a.checked + #b.checked").value, 0);
});

test("sum/count filter the set in the selector with :checked", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="checkbox" value="10" checked></li>
    <li><input class="amount" type="checkbox" value="20"></li>
    <li><input class="amount" type="checkbox" value="30" checked></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:checked')").value, 40);
  assert.equal(evaluateFormula("count('#list .amount:checked')").value, 2);
});

test("sum over plain inputs and count over li are unchanged", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<input class="amount" value="2.5"><input class="amount" value="3.25"><li class="row"></li><li class="row"></li>';
  document.body.appendChild(root);

  assert.equal(evaluateFormula("sum('.amount')").value, 5.75);
  assert.equal(evaluateFormula("count('.row')").value, 2);
});