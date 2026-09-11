import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../tests/jsdom.ts";

let dom: JSDOM;
let defineInteractableHost: typeof import("./interactable-host.ts").defineInteractableHost;

before(async () => {
  dom = setupJsdom();
  await import("./modifiable/modifiable.ts");
  await import("./dirtyable/dirtyable.ts");
  await import("./listable/listable.ts");
  await import("./summable/summable.ts");
  ({ defineInteractableHost } = await import("./interactable-host.ts"));
  defineInteractableHost("button");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

const MARKUP = `
<label>Qty
  <input is="interactable-input" id="qty" implements="modifiable dirtyable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)"
         on-keydown="escape: this.reset().markClean()">
</label>
<button id="dec" is="interactable-button" on-click="#qty.dec()">−</button>
<button id="inc" is="interactable-button" on-click="#qty.inc()">+</button>
<button id="inc5" is="interactable-button" on-click="#qty.inc(5)">+5</button>
<button id="reset" is="interactable-button" on-click="#qty.reset().markClean()">Reset</button>
<output is="interactable-output" id="preview" implements="modifiable">1</output>

<ul is="interactable-ul" id="list" implements="listable" listable-min-rows="1">
  <li>
    <input is="interactable-input" class="amount" type="number" value="2.5" on-input="#total.sum({root: #list, select: '.amount'})">
    <button is="interactable-button" on-click="#list.removeRow(this); #total.sum({root: #list, select: '.amount'})">×</button>
  </li>
</ul>
<button id="add-row" is="interactable-button" on-click="#list.adopt(#row-tpl)">Add row</button>
<template id="row-tpl"><li><input is="interactable-input" class="amount" type="number" value="3.25" on-input="#total.sum({root: #list, select: '.amount'})"><button is="interactable-button" on-click="#list.removeRow(this); #total.sum({root: #list, select: '.amount'})">×</button></li></template>
<output is="interactable-output" id="total" implements="summable" summable-precision="2">0</output>
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

test("the +5 trace: inc clamps, the synthetic input dirties and the preview follows", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  assert.equal(qty.value, "1");
  assert.equal(qty.classList.contains("is-dirty"), false);
  assert.equal(preview.textContent, "1");

  click(byId("inc5"));
  assert.equal(qty.value, "6");
  assert.equal(qty.classList.contains("is-dirty"), true);
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

test("Reset runs this.reset().markClean(): back to the authored value, clean", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  click(byId("inc5"));
  assert.equal(qty.value, "6");
  assert.equal(qty.classList.contains("is-dirty"), true);

  click(byId("reset"));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.classList.contains("is-dirty"), false);
});

test("Escape on #qty runs the keyed this.reset().markClean()", async () => {
  mount();
  await flush();

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;

  qty.value = "8";
  qty.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(qty.classList.contains("is-dirty"), true);
  assert.equal(preview.textContent, "8");

  qty.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.classList.contains("is-dirty"), false);
});

test("the × trace: removeRow finds the row from the button, then sum re-reads the remaining inputs", async () => {
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
  assert.equal(total.textContent, "3.25");
  assert.equal(total.dataset["value"], "3.25");

  const lastRowRemove = (list.children[0] as HTMLElement).querySelector("button")!;
  click(lastRowRemove);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "3.25");
});

test("the Add row trace: adopt clones the template; typing in an amount re-sums", async () => {
  mount();
  await flush();

  const list = byId("list") as HTMLUListElement;
  const total = byId("total") as HTMLOutputElement;

  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "0");

  click(byId("add-row"));
  assert.equal(list.children.length, 2);

  const clonedAmount = list.querySelectorAll(".amount")[1] as HTMLInputElement;
  assert.equal(clonedAmount.value, "3.25");
  clonedAmount.value = "10";
  clonedAmount.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "12.50");
  assert.equal(total.dataset["value"], "12.5");
});