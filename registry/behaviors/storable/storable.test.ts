import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { ImplementationEvent } from "@interactable/implementation-event.ts";
import type { Attachment } from "@interactable/attachment.ts";

let dom: JSDOM;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let getAttachment: typeof import("@interactable/attachment.ts").getAttachment;

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/storable/storable.ts");
  await import("@behaviors/attributable/attributable.ts");
  ({ start } = await import("@interactable/start.ts"));
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ getAttachment } = await import("@interactable/attachment.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  setReadyState("complete");
});

function hostElement<T extends HTMLElement>(tag: string, attributes: Record<string, string>): T {
  const el = document.createElement(tag) as T;
  el.setAttribute("implements", "storable");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(
  el: Element,
  verb: string,
  arg?: unknown,
): InstanceType<typeof InteractionEventClass> {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

function seen(el: Element, type: string): string[] {
  const values: string[] = [];
  el.addEventListener(type, (e) => values.push((e as ImplementationEvent).values["reason"] ?? ""));
  return values;
}

function restoreValues(el: Element): string[] {
  const values: string[] = [];
  el.addEventListener("restore", () => values.push("restore"));
  return values;
}

function captureErrors(): { errors: string[]; restore: () => void } {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  return { errors, restore: () => void (console.error = original) };
}

test("save() writes the named fields as one JSON object under storable-id", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  interact(el, "save", { type: "dark", size: 12 });
  assert.equal(localStorage.getItem("draft"), JSON.stringify({ type: "dark", size: 12 }));
  dispose();
});

test("save() with no arguments writes an empty object", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  interact(el, "save");
  assert.equal(localStorage.getItem("draft"), "{}");
  dispose();
});

test("a single field is still stored as an object", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  interact(el, "save", { size: 12 });
  assert.equal(localStorage.getItem("draft"), '{"size":12}');
  dispose();
});

test("a bare ref field is serialised as the element's innerHTML", async () => {
  const dispose = start();
  const cart = document.createElement("div");
  cart.id = "cart";
  cart.innerHTML = "<li>one</li><li>two</li>";
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "cart" });
  document.body.append(el, cart);
  await flush();

  interact(el, "save", { html: cart });
  assert.equal(localStorage.getItem("cart"), JSON.stringify({ html: "<li>one</li><li>two</li>" }));
  dispose();
});

test("save() never fires restore", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();
  const restores = restoreValues(el);
  interact(el, "save", { size: 1 });
  assert.deepEqual(restores, []);
  dispose();
});

test("restore() is silent when nothing is stored", async () => {
  const dispose = start();
  const el = hostElement<HTMLDivElement>("div", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();
  const restores = restoreValues(el);
  const errors = seen(el, "restore-error");
  interact(el, "restore");
  assert.deepEqual(restores, []);
  assert.deepEqual(errors, []);
  dispose();
});

test("save() then restore() round-trips the fields as declared values", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(size:number)="this.setAttr({name: 'data-size', value: size})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  interact(el, "save", { size: 12 });
  el.removeAttribute("data-size");
  interact(el, "restore");
  assert.equal(el.getAttribute("data-size"), "12");
  dispose();
});

test("invalid JSON dispatches restore-error with reason parse", async () => {
  const dispose = start();
  localStorage.setItem("draft", "{not json");
  const el = hostElement<HTMLDivElement>("div", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();
  const errors = seen(el, "restore-error");
  interact(el, "restore");
  assert.deepEqual(errors, ["parse"]);
  dispose();
});

test("JSON that is not an object dispatches restore-error with reason parse", async () => {
  const dispose = start();
  localStorage.setItem("draft", "12");
  const el = hostElement<HTMLDivElement>("div", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();
  const errors = seen(el, "restore-error");
  interact(el, "restore");
  assert.deepEqual(errors, ["parse"]);
  dispose();
});

test("a stored object matching a declared shape runs that handler", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(name:string)="this.setAttr({name: 'data-name', value: name})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("draft", JSON.stringify({ name: "specs" }));
  interact(el, "restore");
  assert.equal(el.getAttribute("data-name"), "specs");
  dispose();
});

test("a stored object matching no declared shape is silent", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(name:string)="this.setAttr({name: 'data-name', value: name})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("draft", JSON.stringify({ other: "x" }));
  const restores = restoreValues(el);
  const errors = seen(el, "restore-error");
  const logs = captureErrors();
  try {
    interact(el, "restore");
  } finally {
    logs.restore();
  }
  assert.deepEqual(restores, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(logs.errors, []);
  dispose();
});

test("a JSON type mismatch is a silent non-match, not a parse error", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(size:number)="this.setAttr({name: 'data-size', value: size})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("draft", JSON.stringify({ size: "12" }));
  const restores = restoreValues(el);
  const errors = seen(el, "restore-error");
  interact(el, "restore");
  assert.deepEqual(restores, []);
  assert.deepEqual(errors, []);
  assert.equal(el.hasAttribute("data-size"), false);
  dispose();
});

test("only the matching shape's handler runs; the others stay quiet", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="pm" ` +
    `on-restore(npm:boolean)="this.setAttr({name: 'data-npm', value: ''})" ` +
    `on-restore(pnpm:boolean)="this.setAttr({name: 'data-pnpm', value: ''})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("pm", JSON.stringify({ pnpm: true }));
  const logs = captureErrors();
  try {
    interact(el, "restore");
  } finally {
    logs.restore();
  }
  assert.equal(el.hasAttribute("data-pnpm"), true, "the matching handler runs");
  assert.equal(el.hasAttribute("data-npm"), false, "the non-matching handler is skipped");
  assert.deepEqual(logs.errors, [], "skipping a non-matching handler logs nothing");
  dispose();
});

test("a declared name whose type accepts undefined is satisfied by its absence", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(name:string,size:number|undefined)="this.setAttr({name: 'data-name', value: name})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("draft", JSON.stringify({ name: "specs" }));
  interact(el, "restore");
  assert.equal(el.getAttribute("data-name"), "specs");

  localStorage.setItem("draft", JSON.stringify({ name: "specs", size: 12 }));
  el.removeAttribute("data-name");
  interact(el, "restore");
  assert.equal(el.getAttribute("data-name"), "specs");
  dispose();
});

test("ambiguous on-restore handlers are logged once, and a widened handler replaces the narrower one", async () => {
  const dispose = start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-id="draft" ` +
    `on-restore(name:string)="this.setAttr({name: 'data-a', value: name})" ` +
    `on-restore(name:string,size:number|undefined)="this.setAttr({name: 'data-b', value: name})"></div>`;
  const el = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(el);
  await flush();

  localStorage.setItem("draft", JSON.stringify({ name: "specs" }));
  const logs = captureErrors();
  try {
    interact(el, "restore");
    interact(el, "restore");
  } finally {
    logs.restore();
  }
  assert.equal(logs.errors.length, 1, "the ambiguity is reported once");
  assert.ok(logs.errors[0]!.includes("replaces the narrower one"));
  dispose();
});

test("clear() removes the stored object and dispatches nothing", async () => {
  const dispose = start();
  localStorage.setItem("draft", JSON.stringify({ size: 12 }));
  const el = hostElement<HTMLDivElement>("div", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();
  const restores = restoreValues(el);
  const errors = seen(el, "restore-error");

  interact(el, "clear");
  assert.equal(localStorage.getItem("draft"), null);
  interact(el, "restore");
  assert.deepEqual(restores, []);
  assert.deepEqual(errors, []);
  dispose();
});

test("a save that throws a quota error dispatches save-error quota and leaves the old value", async () => {
  const dispose = start();
  localStorage.setItem("draft", JSON.stringify({ size: 1 }));
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  const original = globalThis.localStorage;
  const backing = original;
  const throwing: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (key) => backing.getItem(key),
    key: (index) => backing.key(index),
    removeItem: (key) => backing.removeItem(key),
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
  globalThis.localStorage = throwing;
  try {
    const errors = seen(el, "save-error");
    interact(el, "save", { size: 2 });
    assert.deepEqual(errors, ["quota"]);
    assert.equal(backing.getItem("draft"), JSON.stringify({ size: 1 }), "the old value survives");
  } finally {
    globalThis.localStorage = original;
  }
  dispose();
});

test("a save that throws any other error dispatches save-error denied", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  const original = globalThis.localStorage;
  const backing = original;
  const throwing: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (key) => backing.getItem(key),
    key: (index) => backing.key(index),
    removeItem: (key) => backing.removeItem(key),
    setItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
  };
  globalThis.localStorage = throwing;
  try {
    const errors = seen(el, "save-error");
    interact(el, "save", { size: 2 });
    assert.deepEqual(errors, ["denied"]);
  } finally {
    globalThis.localStorage = original;
  }
  dispose();
});

test("a save whose fields cannot be serialised dispatches save-error serialize", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  const attachment = getAttachment(el) as Attachment;
  const instance = attachment.implementations.get("storable") as {
    save: (e: unknown, arg: unknown) => void;
  };
  const errors = seen(el, "save-error");
  instance.save(new Event("interaction"), { size: 1n });
  assert.deepEqual(errors, ["serialize"]);
  dispose();
});

test("save-error and restore-error do not abort the phrase that triggered them", async () => {
  const dispose = start();
  const el = hostElement<HTMLButtonElement>("button", { "storable-id": "draft" });
  document.body.appendChild(el);
  await flush();

  const original = globalThis.localStorage;
  const backing = original;
  const throwing: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (key) => backing.getItem(key),
    key: (index) => backing.key(index),
    removeItem: (key) => backing.removeItem(key),
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
  globalThis.localStorage = throwing;
  try {
    const phrase = new InteractionEventClass({
      verb: "save",
      arg: { size: 1 },
      source: el,
      originalEvent: new Event("interaction"),
    });
    el.dispatchEvent(phrase);
    assert.equal(phrase.error, undefined, "save() catches its own failure and never throws");
  } finally {
    globalThis.localStorage = original;
  }

  localStorage.setItem("draft", "{not json");
  const restoreEvent = interact(el, "restore");
  assert.equal(restoreEvent.error, undefined, "restore() catches the parse failure and never throws");
  dispose();
});

test("missing storable-id is a signature error at attach naming the attribute", async () => {
  const dispose = start();
  const errors = captureErrors();
  try {
    const el = hostElement<HTMLDivElement>("div", {});
    document.body.appendChild(el);
    await flush();
  } finally {
    errors.restore();
  }
  assert.ok(errors.errors.some((m) => m.includes("storable-id")), "the error names the attribute");
  dispose();
});
