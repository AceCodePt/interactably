import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";

let dom: JSDOM;

before(async () => {
  dom = setupJsdom();
  await import("../no-propagate/no-propagate.ts");
  await import("./auto-grow.ts");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function textarea(): HTMLTextAreaElement {
  const el = document.createElement("textarea", { is: "interactable-textarea" }) as HTMLTextAreaElement;
  el.setAttribute("implements", "auto-grow");
  return el;
}

test("auto-grow disables internal scrolling and manual resize on connect", async () => {
  const el = textarea();
  document.body.appendChild(el);
  await flush();

  assert.equal(el.style.overflowY, "hidden");
  assert.equal(el.style.resize, "none");
});

test("auto-grow grows the textarea to its scrollHeight on input", async () => {
  const el = textarea();
  document.body.appendChild(el);
  await flush();

  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 150 });
  el.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(el.style.height, "150px");
});

test("auto-grow re-reads scrollHeight on each input", async () => {
  const el = textarea();
  document.body.appendChild(el);
  await flush();

  let height = 40;
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height });
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(el.style.height, "40px");

  height = 200;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(el.style.height, "200px");
});

test("auto-grow also grows on change", async () => {
  const el = textarea();
  document.body.appendChild(el);
  await flush();

  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 80 });
  el.dispatchEvent(new Event("change", { bubbles: true }));

  assert.equal(el.style.height, "80px");
});
