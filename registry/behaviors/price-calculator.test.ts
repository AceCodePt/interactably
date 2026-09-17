import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/modifiable/modifiable.ts");
  await import("@behaviors/dirtyable/dirtyable.ts");
  await import("@behaviors/attributable/attributable.ts");
  await import("@behaviors/listable/listable.ts");
  await import("@behaviors/formattable/formattable.ts");
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

const MARKUP = `
<label>Qty
  <input id="qty" implements="modifiable dirtyable attributable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)"
         on-dirty="this.setAttr({name: 'data-dirty', value: ''})"
         on-clean="this.removeAttr('data-dirty')"
         on-keydown="escape: this.reset(); #preview.compute()">
</label>
<button id="dec" on-click="#qty.dec(); #preview.compute()">−</button>
<button id="inc" on-click="#qty.inc(); #preview.compute()">+</button>
<button id="inc5" on-click="#qty.inc(5); #preview.compute()">+5</button>
<button id="reset" on-click="#qty.reset(); #preview.compute()">Reset</button>
<output id="preview" implements="modifiable"
        modifiable-formula="#qty.value">1</output>

<ul id="list" implements="listable" listable-min-rows="1">
  <li>
    <input class="amount" type="number" value="2.5" on-input="#total.compute()">
    <button on-click="#list.removeRow(this); #total.compute()">×</button>
  </li>
</ul>
<button id="add-row" on-click="#list.adopt(#row-tpl)">Add row</button>
<template id="row-tpl"><li><input class="amount" type="number" value="3.25" on-input="#total.compute()"><button on-click="#list.removeRow(this); #total.compute()">×</button></li></template>
<output id="total" implements="modifiable formattable"
        modifiable-formula="sum('#list .amount')"
        formattable-format="{ style: 'currency', currency: 'USD' }">0</output>
`;

function mount(): void {
  const holder = document.createElement("div");
  holder.innerHTML = MARKUP;
  document.body.appendChild(holder);
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function byId(id: string): HTMLElement {
  return document.getElementById(id)!;
}

test("the +5 trace: inc clamps, dirties via the interaction event and the preview follows", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  assert.equal(qty.value, "1");
  assert.equal(qty.hasAttribute("data-dirty"), false);
  assert.equal(preview.textContent, "1");

  click(byId("inc5"));
  assert.equal(qty.value, "6");
  assert.equal(qty.hasAttribute("data-dirty"), true);
  assert.equal(preview.textContent, "6");

  click(byId("inc5"));
  assert.equal(qty.value, "10");
  assert.equal(preview.textContent, "10");

  click(byId("inc"));
  assert.equal(qty.value, "10");
  assert.equal(preview.textContent, "10");

  click(byId("dec"));
  assert.equal(qty.value, "9");
  assert.equal(preview.textContent, "9");
  click(byId("dec"));
  assert.equal(qty.value, "8");
  assert.equal(preview.textContent, "8");
});

test("dec clamps at the min", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  click(byId("dec"));
  assert.equal(qty.value, "0");
  assert.equal(preview.textContent, "0");

  click(byId("dec"));
  assert.equal(qty.value, "0");
  assert.equal(preview.textContent, "0");
});

test("Reset runs this.reset(): back to the authored value, clean", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  click(byId("inc5"));
  assert.equal(qty.value, "6");
  assert.equal(qty.hasAttribute("data-dirty"), true);

  click(byId("reset"));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.hasAttribute("data-dirty"), false);
});

test("Escape on #qty runs the keyed this.reset()", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  qty.value = "8";
  qty.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(qty.hasAttribute("data-dirty"), true);
  assert.equal(preview.textContent, "8");

  qty.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.hasAttribute("data-dirty"), false);
});

test("the × trace: removeRow finds the row from the button, then compute re-reads the remaining amounts", async () => {
  mount();
  await flush();

  const list = byId("list") as HTMLUListElement;
  const total = byId("total") as HTMLOutputElement;

  click(byId("add-row"));
  assert.equal(list.children.length, 2);

  const rows = [...list.children] as HTMLElement[];
  const firstRowRemove = rows[0]!.querySelector("button")!;
  click(firstRowRemove);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$3.25");
  assert.equal(total.getAttribute("formattable-value"), "3.25");

  const lastRowRemove = (list.children[0] as HTMLElement).querySelector("button")!;
  click(lastRowRemove);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$3.25");
});

test("the Add row trace: adopt clones the template; typing in an amount recomputes", async () => {
  mount();
  await flush();

  const list = byId("list") as HTMLUListElement;
  const total = byId("total") as HTMLOutputElement;

  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$2.50");

  click(byId("add-row"));
  assert.equal(list.children.length, 2);
  await flush();

  const clonedAmount = list.querySelectorAll(".amount")[1] as HTMLInputElement;
  assert.equal(clonedAmount.value, "3.25");
  clonedAmount.value = "10";
  clonedAmount.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$12.50");
  assert.equal(total.getAttribute("formattable-value"), "12.5");
});