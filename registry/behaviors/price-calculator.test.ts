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
  await import("@behaviors/renderable/renderable.ts");
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
         on-keydown="escape: this.reset(); #preview.set(#qty.value)">
</label>
<button id="dec" on-click="#qty.set(#qty.value - 1); #preview.set(#qty.value)">−</button>
<button id="inc" on-click="#qty.set(#qty.value + 1); #preview.set(#qty.value)">+</button>
<button id="inc5" on-click="#qty.set(#qty.value + 5); #preview.set(#qty.value)">+5</button>
<button id="reset" on-click="#qty.reset(); #preview.set(#qty.value)">Reset</button>
<output id="preview" implements="modifiable"
        on-load="this.set(#qty.value)">1</output>

<ul id="list" implements="renderable">
  <li id="row-1">
    <input class="amount" type="number" value="2.5" on-input="#total.set(sum('#list .amount'))">
    <button on-click="#list.render({swap: 'delete', target: '#row-1'}); #total.set(sum('#list .amount'))">×</button>
  </li>
</ul>
<button id="add-row" on-click="#list.render({template: #row-tpl, swap: 'beforeend', id: now()}); #total.set(sum('#list .amount'))">Add row</button>
<template id="row-tpl"><li id="row-{id}"><input class="amount" type="number" value="3.25" on-input="#total.set(sum('#list .amount'))"><button on-click="#list.render({swap: 'delete', target: '#row-{id}'}); #total.set(sum('#list .amount'))">×</button></li></template>
<output id="total" implements="modifiable formattable"
        on-load="this.set(sum('#list .amount'))"
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

test("the +5 trace: set writes the sum, dirties via the interaction event and the preview follows", async () => {
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
  assert.equal(qty.value, "11");
  assert.equal(preview.textContent, "11");

  click(byId("inc"));
  assert.equal(qty.value, "12");
  assert.equal(preview.textContent, "12");

  click(byId("dec"));
  assert.equal(qty.value, "11");
  assert.equal(preview.textContent, "11");
  click(byId("dec"));
  assert.equal(qty.value, "10");
  assert.equal(preview.textContent, "10");
});

test("set does not clamp: dec walks below the min and the input reports rangeUnderflow", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  click(byId("dec"));
  assert.equal(qty.value, "0");
  assert.equal(preview.textContent, "0");

  click(byId("dec"));
  assert.equal(qty.value, "-1");
  assert.equal(preview.textContent, "-1");
  assert.equal(qty.validity.rangeUnderflow, true);
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

test("the × trace: render({swap: 'delete', target}) deletes the targeted row, then set(sum) re-reads the remaining amounts", async () => {
  mount();
  await flush();

  const list = byId("list") as HTMLUListElement;
  const total = byId("total") as HTMLOutputElement;

  click(byId("add-row"));
  assert.equal(list.children.length, 2);
  await flush();

  const rows = [...list.children] as HTMLElement[];
  const firstRowRemove = rows[0]!.querySelector("button")!;
  click(firstRowRemove);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$3.25");
  assert.equal(total.getAttribute("formattable-value"), "3.25");

  click(list.querySelector("li button")!);
  assert.equal(list.children.length, 0, "there is no floor: the last row can be deleted too");
  assert.equal(total.textContent, "$0.00");
});

test("the Add row trace: render stamps a row with an author id; typing in an amount recomputes", async () => {
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
  assert.ok((clonedAmount.closest("li") as HTMLElement).id.startsWith("row-"), "the row carries an author-supplied id");
  clonedAmount.value = "10";
  clonedAmount.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$12.50");
  assert.equal(total.getAttribute("formattable-value"), "12.5");
});