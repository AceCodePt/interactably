import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let defineImplementation: typeof import("@behaviors/_implementation-definition.ts").defineImplementation;

const log: string[] = [];

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/pastable/pastable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
  ({ defineImplementation } = await import("@behaviors/_implementation-definition.ts"));
  defineImplementation(
    "spy",
    { tags: ["div"], verbs: { mark: "string" } },
    () => ({
      mark: (_e, value) => {
        log.push(value);
      },
    }),
  );
  ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  log.length = 0;
  document.body.replaceChildren();
});

function pastableElement(tag: "input" | "textarea"): HTMLInputElement | HTMLTextAreaElement {
  const el = document.createElement(tag);
  el.setAttribute("implements", "pastable");
  return el as HTMLInputElement | HTMLTextAreaElement;
}

function paste(el: Element, inputType: string): void {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}

test("insertFromPaste fires pasted once; typed and dropped text fire nothing", async () => {
  const dispose = start();
  const el = pastableElement("input");
  document.body.appendChild(el);
  await flush();

  let pasted = 0;
  el.addEventListener("pasted", () => pasted++);

  paste(el, "insertFromPaste");
  paste(el, "insertFromPaste");
  assert.equal(pasted, 2, "each insertFromPaste fires pasted");

  paste(el, "insertText");
  paste(el, "insertFromDrop");
  assert.equal(pasted, 2, "insertText and insertFromDrop fire nothing");
  dispose();
});

test("insertFromPasteAsQuotation fires pasted", async () => {
  const dispose = start();
  const el = pastableElement("textarea");
  document.body.appendChild(el);
  await flush();

  let pasted = 0;
  el.addEventListener("pasted", () => pasted++);

  paste(el, "insertFromPasteAsQuotation");
  assert.equal(pasted, 1, "insertFromPasteAsQuotation is a paste and fires pasted");
  dispose();
});

test("for one paste the sequence is on-input phrase, then implementation onInput, then on-pasted phrase", async () => {
  const dispose = start();
  const recv = document.createElement("div");
  recv.id = "recv";
  recv.setAttribute("implements", "spy");
  const el = pastableElement("input");
  el.setAttribute("on-input", "#recv.mark('input')");
  el.setAttribute("on-pasted", "#recv.mark('pasted')");
  document.body.append(el, recv);
  await flush();

  paste(el, "insertFromPaste");
  assert.deepEqual(log, ["input", "pasted"], "on-input runs before on-pasted for one paste");
  dispose();
});

test("on-pasted cleaning leaves digits only after a paste", async () => {
  const dispose = start();
  const el = pastableElement("input");
  el.setAttribute("implements", "pastable modifiable");
  el.setAttribute("on-pasted", "this.set(replace(this.value, '\\D', ''))");
  document.body.appendChild(el);
  await flush();

  el.value = "abc123def";
  paste(el, "insertFromPaste");
  assert.equal(el.value, "123");
  dispose();
});

test("on-input masking and on-pasted cleaning coexist, each for its own reason", async () => {
  const dispose = start();
  const el = pastableElement("input");
  el.setAttribute("implements", "pastable modifiable");
  el.setAttribute("on-input", "this.set(replace(this.value, '[a-z]', ''))");
  el.setAttribute("on-pasted", "this.set(replace(this.value, '[^0-9]', ''))");
  document.body.appendChild(el);
  await flush();

  el.value = "12ab";
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "ab" }));
  assert.equal(el.value, "12", "on-input masks letters on a typed insertText");

  el.value = "12$3";
  paste(el, "insertFromPaste");
  assert.equal(el.value, "123", "on-pasted strips non-digits after a paste");
  dispose();
});

test("on-pasted runs after on-input for the same paste; if both write the value, on-pasted wins", async () => {
  const dispose = start();
  const el = pastableElement("input");
  el.setAttribute("implements", "pastable modifiable");
  const order: string[] = [];
  el.addEventListener("pasted", () => order.push("pasted-event"));
  el.setAttribute("on-input", "this.set(replace(this.value, '[a-z]', ''))");
  el.setAttribute("on-pasted", "this.set(replace(this.value, '[^0-9]', ''))");
  document.body.appendChild(el);
  await flush();

  el.value = "ab1c!";
  paste(el, "insertFromPaste");
  assert.equal(el.value, "1", "on-pasted's non-digit clean runs last and wins over on-input's letter mask");
  dispose();
});