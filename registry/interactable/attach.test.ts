import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  resetFakeIntersectionObserver,
} from "@tests/intersection-observer.ts";
import { ANCHOR } from "@utils/formula.ts";

let dom: JSDOM;
let dispose: (() => void) | undefined;
let start: typeof import("@interactable/start.ts").start;
let getAttachment: typeof import("@interactable/attachment.ts").getAttachment;
let isAttached: typeof import("@interactable/attachment.ts").isAttached;
let defineImplementation: typeof import("@behaviors/_implementation-definition.ts").defineImplementation;

const lifecycle: string[] = [];
const attrCalls: string[] = [];

before(async () => {
  dom = setupJsdom();
  installFakeIntersectionObserver();
  ({ start } = await import("@interactable/start.ts"));
  ({ getAttachment, isAttached } = await import("@interactable/attachment.ts"));
  ({ defineImplementation } = await import("@behaviors/_implementation-definition.ts"));
  await import("@behaviors/revealable/revealable.ts");
  await import("@behaviors/storable/storable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
  await import("@behaviors/attributable/attributable.ts");
  defineImplementation(
    "traceable",
    { tags: ["div", "section"], verbs: { go: "undefined", ping: "undefined" } },
    (_el) => ({
      go: () => {
        lifecycle.push("traceable.go");
      },
      ping: () => {
        lifecycle.push("traceable.ping");
      },
      connectedCallback: () => {
        lifecycle.push("traceable.connected");
      },
      disconnectedCallback: () => {
        lifecycle.push("traceable.disconnected");
      },
    }),
  );
  defineImplementation(
    "attr-spy",
    { tags: ["div"], verbs: { record: "number | undefined" } },
    (_el) => ({
      record: (_e, n) => n,
      attributeChangedCallback: (name: string) => {
        attrCalls.push(name);
      },
    }),
  );
});

after(() => {
  dispose?.();
  teardownJsdom(dom);
});

beforeEach(() => {
  lifecycle.length = 0;
  attrCalls.length = 0;
  document.body.replaceChildren();
  setReadyState("complete");
  resetFakeIntersectionObserver();
});

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  assert.ok(el !== null, `#${id} exists`);
  return el;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

test("start() attaches exactly the participants of its initial scan and skips bystanders", () => {
  const holder = document.createElement("div");
  holder.innerHTML = `
    <button id="t1" on-click="#r.go()">x</button>
    <div id="r" implements="traceable"></div>
    <div id="t2" on-click="#r.go()"></div>
    <p id="b1"></p>
    <p id="b2"></p>
  `;
  document.body.appendChild(holder);
  const dispose = start();
  assert.equal(isAttached(byId("t1")), true);
  assert.equal(isAttached(byId("r")), true);
  assert.equal(isAttached(byId("t2")), true);
  assert.equal(isAttached(byId("b1")), false, "a bystander is not attached");
  assert.equal(isAttached(byId("b2")), false);
  dispose();
});

test("start() is idempotent per root: a second call returns the same dispose", () => {
  const first = start();
  const second = start();
  assert.strictEqual(first, second);
});

test("start() while the document is loading defers the scan to DOMContentLoaded, including an element inserted in between", async () => {
  setReadyState("loading");
  const holder = document.createElement("div");
  holder.innerHTML = `<div id="a" implements="traceable"></div>`;
  document.body.appendChild(holder);
  const dispose = start();
  assert.equal(isAttached(byId("a")), false, "nothing attaches while loading");

  const b = document.createElement("div");
  b.id = "b";
  b.setAttribute("implements", "traceable");
  document.body.appendChild(b);
  assert.equal(isAttached(b), false);

  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();
  assert.equal(isAttached(byId("a")), true, "the initial scan attaches at DOMContentLoaded");
  assert.equal(isAttached(byId("b")), true, "an element inserted during parse attaches too");
  dispose();
});

test("an element inserted after start() is not attached synchronously, then is one microtask later", async () => {
  const dispose = start();
  const el = document.createElement("button");
  el.id = "late";
  el.setAttribute("on-click", "#r.ping()");
  document.body.appendChild(el);
  assert.equal(isAttached(el), false, "not attached synchronously after insertion");

  await flush();
  assert.equal(isAttached(el), true, "attached one microtask after insertion");
  dispose();
});

test("a programmatic click() in the microtask gap runs nothing", async () => {
  const dispose = start();
  const receiver = document.createElement("div");
  receiver.id = "r";
  receiver.setAttribute("implements", "traceable");
  const trigger = document.createElement("button");
  trigger.id = "b";
  trigger.setAttribute("on-click", "#r.go()");
  document.body.append(trigger, receiver);
  await flush();

  lifecycle.length = 0;
  trigger.remove();
  const reinserted = document.createElement("button");
  reinserted.id = "b2";
  reinserted.setAttribute("on-click", "#r.go()");
  document.body.appendChild(reinserted);
  const pinged: string[] = [];
  receiver.addEventListener("interaction", (raw) => {
    if ((raw as unknown as { verb: string }).verb === "go") pinged.push("go");
  });
  reinserted.click();
  assert.deepEqual(pinged, [], "a click in the gap between insertion and attach runs nothing");
  await flush();
  reinserted.click();
  assert.deepEqual(pinged, ["go"], "the same click after attach runs");
  dispose();
});

test("removing an element detaches it: listeners gone, phrase state cleared, intersect torn down, disconnectedCallback ran", async () => {
  const dispose = start();
  const trigger = document.createElement("section");
  trigger.id = "s";
  trigger.setAttribute("implements", "traceable");
  trigger.setAttribute("on-intersect-enter", "#r.go()");
  const receiver = document.createElement("div");
  receiver.id = "r";
  receiver.setAttribute("implements", "traceable");
  document.body.append(trigger, receiver);
  await flush();
  assert.equal(FakeIntersectionObserver.instances.length, 1, "the intersect observer exists");

  trigger.setAttribute("on-click", "#r.go()");
  await flush();
  trigger.click();
  assert.deepEqual(lifecycle, ["traceable.connected", "traceable.connected", "traceable.go"], "the trigger fires while attached");

  lifecycle.length = 0;
  trigger.setAttribute("on-click", "#r.debounce(20).go()");
  trigger.click();
  trigger.remove();
  await flush();

  assert.equal(isAttached(trigger), false, "the element is no longer attached");
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.includes(trigger), false, "intersect torn down");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(lifecycle, ["traceable.disconnected"], "the pending debounce was cleared and the detached listener runs nothing");
  dispose();
});

test("a move (remove + re-insert in one task) is a no-op: the same instance survives", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.id = "moved";
  el.setAttribute("implements", "traceable");
  document.body.appendChild(el);
  await flush();
  const before = getAttachment(el);
  assert.ok(before !== undefined);

  lifecycle.length = 0;
  const holder = document.createElement("div");
  document.body.appendChild(holder);
  holder.appendChild(el);
  await flush();

  assert.strictEqual(getAttachment(el), before, "the attachment record survives the move");
  assert.ok(!lifecycle.includes("traceable.disconnected"), "no disconnectedCallback on a move");
  dispose();
});

test("an on-click attribute added to an attached element binds on the next click; removing it unbinds", async () => {
  const dispose = start();
  const trigger = document.createElement("div");
  trigger.id = "t";
  trigger.setAttribute("implements", "traceable");
  const receiver = document.createElement("div");
  receiver.id = "r";
  receiver.setAttribute("implements", "traceable");
  document.body.append(trigger, receiver);
  await flush();

  trigger.setAttribute("on-click", "#r.go()");
  await flush();
  const pinged: string[] = [];
  receiver.addEventListener("interaction", (raw) => {
    if ((raw as unknown as { verb: string }).verb === "go") pinged.push("go");
  });
  click(trigger);
  assert.deepEqual(pinged, ["go"], "the newly added attribute runs on the next click");

  trigger.removeAttribute("on-click");
  await flush();
  click(trigger);
  assert.deepEqual(pinged, ["go"], "the removed attribute no longer runs");
  dispose();
});

test("editing implements attaches a new name and detaches a removed one individually", async () => {
  const dispose = start();
  const el = document.createElement("input");
  el.id = "e";
  el.setAttribute("implements", "revealable");
  el.hidden = true;
  document.body.appendChild(el);
  await flush();
  assert.equal(isAttached(el), true);
  assert.ok(getAttachment(el)?.implementations.has("revealable"), "revealable attaches");

  el.setAttribute("implements", "revealable storable");
  el.setAttribute("storable-key", "k");
  el.setAttribute("storable-value", "v");
  el.setAttribute("on-load", "this.restore()");
  await flush();
  assert.ok(getAttachment(el)?.implementations.has("storable"), "storable attaches when named");
  assert.ok(getAttachment(el)?.implementations.has("revealable"), "revealable stays");

  const revealableInstance = getAttachment(el)?.implementations.get("revealable");
  el.setAttribute("implements", "revealable");
  await flush();
  assert.ok(getAttachment(el)?.implementations.get("revealable") === revealableInstance, "the revealable instance is unchanged");
  assert.ok(!getAttachment(el)?.implementations.has("storable"), "storable detaches when unnamed");
  dispose();
});

test("an element that gains implements or on-* after insertion is not attached (the participation caveat)", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.id = "caveat";
  document.body.appendChild(el);
  await flush();
  assert.equal(isAttached(el), false, "a plain element is not attached");

  el.setAttribute("implements", "traceable");
  await flush();
  assert.equal(isAttached(el), false, "gaining implements later does not attach it");

  const event = new Event("interaction") as Event & { verb?: string; handled?: boolean };
  event.verb = "go";
  el.dispatchEvent(event);
  assert.equal(event.handled, undefined, "no interaction listener is present");
  dispose();
});

test("dispose() from start() disconnects the observer: a later insertion is not attached", async () => {
  const dispose = start();
  dispose();
  const el = document.createElement("button");
  el.setAttribute("on-click", "#r.go()");
  document.body.appendChild(el);
  await flush();
  assert.equal(isAttached(el), false, "the observer is gone");
});

test("on-load fires once per attach, after implementations are instantiated", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.id = "self";
  el.setAttribute("implements", "attributable");
  el.setAttribute("on-load", "this.setAttr({name: 'data-loaded', value: ''})");
  document.body.appendChild(el);
  await flush();
  assert.equal(el.hasAttribute("data-loaded"), true, "on-load ran after attributable attached");
  dispose();
});

test("on-load in the initial scan fires once per element", () => {
  const holder = document.createElement("div");
  holder.innerHTML = `
    <div id="x" implements="attributable" on-load="this.setAttr({name: 'a', value: '1'})"></div>
    <div id="y" implements="attributable" on-load="this.setAttr({name: 'a', value: '2'})"></div>
  `;
  document.body.appendChild(holder);
  const dispose = start();
  assert.equal(byId("x").getAttribute("a"), "1");
  assert.equal(byId("y").getAttribute("a"), "2");
  dispose();
});

test("a template is inert: nothing inside attaches until a clone is inserted, then its on-load fires once", async () => {
  const dispose = start();
  const template = document.createElement("template");
  template.innerHTML = `<div implements="attributable" on-load="this.setAttr({name: 'data-c', value: ''})"></div>`;
  document.body.appendChild(template);
  await flush();
  assert.equal(template.content.querySelector("div")!.hasAttribute("data-c"), false, "template content is inert");

  document.body.appendChild(template.content.cloneNode(true));
  await flush();
  const clone = document.querySelector("[data-c]");
  assert.ok(clone !== null, "the clone's on-load fired on insertion");
  dispose();
});

test("a move does not re-fire on-load", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.id = "m";
  el.setAttribute("implements", "attributable");
  el.setAttribute("on-load", "this.setAttr({name: 'data-n', value: '1'})");
  document.body.appendChild(el);
  await flush();
  assert.equal(el.getAttribute("data-n"), "1");

  const holder = document.createElement("div");
  document.body.appendChild(holder);
  holder.appendChild(el);
  await flush();
  assert.equal(el.getAttribute("data-n"), "1", "a move does not re-fire on-load");
  dispose();
});

test("on-load fires in document order across the batch, so a button before its panel resolves", async () => {
  const holder = document.createElement("div");
  holder.innerHTML = `
    <button id="open" on-load="#panel.show()">x</button>
    <div id="panel" implements="revealable" hidden></div>
  `;
  document.body.appendChild(holder);
  const dispose = start();
  await flush();
  assert.equal(byId("panel").hidden, false, "#panel was attached before the button's on-load ran");
  dispose();
});

test("on-load fires at attach, not when a native load event is dispatched", async () => {
  const dispose = start();
  const img = document.createElement("img");
  img.id = "i";
  img.setAttribute("implements", "attributable");
  img.setAttribute("on-load", "this.setAttr({name: 'data-l', value: ''})");
  document.body.appendChild(img);
  await flush();
  assert.equal(img.hasAttribute("data-l"), true, "on-load fired at attach");

  img.removeAttribute("data-l");
  img.dispatchEvent(new Event("load"));
  assert.equal(img.hasAttribute("data-l"), false, "a native load event does not fire on-load");
  dispose();
});

test("on-load resolves this.verb() against an implementation on the same element", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.id = "s";
  el.setAttribute("implements", "traceable attributable");
  el.setAttribute("on-load", "this.setAttr({name: 'data-s', value: 'yes'})");
  document.body.appendChild(el);
  await flush();
  assert.equal(el.getAttribute("data-s"), "yes");
  dispose();
});

test("a row's own fields: & in sum() totals the row the phrase is on", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML = `
    <li class="row" implements="attributable" on-input="this.setAttr({name: 'data-total', value: '' + sum('& .amount')})">
      <input class="amount" type="number" value="10">
      <input class="amount" type="number" value="20">
    </li>
    <li class="row" implements="attributable" on-input="this.setAttr({name: 'data-total', value: '' + sum('& .amount')})">
      <input class="amount" type="number" value="5">
      <input class="amount" type="number" value="7">
    </li>`;
  document.body.appendChild(holder);
  await flush();

  const rows = document.querySelectorAll("li.row");
  const row1 = rows[0]!;
  const firstAmount = row1.querySelector(".amount") as HTMLInputElement;
  firstAmount.value = "7";
  firstAmount.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();

  assert.equal(row1.getAttribute("data-total"), "27", "the row's own sum lands on it as a string");
  assert.equal(rows[1]!.hasAttribute("data-total"), false, "a second row is untouched");
  dispose();
});

test("the & anchor set/remove never reaches attributeChangedCallback", async () => {
  const dispose = start();
  const el = document.createElement("div");
  el.setAttribute("implements", "attr-spy");
  el.setAttribute("on-input", "this.record(count('& *'))");
  el.innerHTML = "<span></span><b></b>";
  document.body.appendChild(el);
  await flush();

  el.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
  assert.equal(el.hasAttribute(ANCHOR), false, "the anchor never survives an evaluation");
  assert.equal(attrCalls.includes(ANCHOR), false, "the marker set/remove pair never reaches attributeChangedCallback");

  el.setAttribute("data-x", "1");
  await flush();
  assert.ok(attrCalls.includes("data-x"), "a normal attribute still reaches attributeChangedCallback");
  dispose();
});

test("length() drives a live character counter from a bounded textarea", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML = `
    <textarea id="bio" maxlength="200" on-input="#bio-count.set(length(this.value) + ' of 200')"></textarea>
    <output id="bio-count" implements="modifiable"></output>`;
  document.body.appendChild(holder);
  await flush();

  const bio = document.getElementById("bio") as HTMLTextAreaElement;
  bio.value = "x".repeat(42);
  bio.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();

  assert.equal(document.getElementById("bio-count")!.textContent, "42 of 200");
  dispose();
});