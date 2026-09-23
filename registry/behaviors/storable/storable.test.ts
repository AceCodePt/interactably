import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { ImplementationEvent } from "@interactable/implementation-event.ts";

let dom: JSDOM;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/storable/storable.ts");
  await import("@behaviors/attributable/attributable.ts");
  ({ start } = await import("@interactable/start.ts"));
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  setReadyState("complete");
});

function hostElement<T extends HTMLElement>(tag: string, attributes: Record<string, string>): T {
  const el = document.createElement(tag) as T;
  el.setAttribute("implements", "storable");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function restoreCalls(el: Element): string[] {
  const seen: string[] = [];
  el.addEventListener("restore", () => seen.push("restore"));
  return seen;
}

function restoreValues(el: Element): string[] {
  const seen: string[] = [];
  el.addEventListener("restore", (e) => seen.push((e as ImplementationEvent).values["value"] ?? ""));
  return seen;
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

test("an element in the initial scan restores on-load after DOMContentLoaded", async () => {
  setReadyState("loading");
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "saved",
    "on-load": "this.restore()",
  });
  const seen = restoreCalls(el);
  document.body.appendChild(el);
  assert.deepEqual(seen, [], "nothing restores while the document is still loading");

  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();
  assert.deepEqual(seen, ["restore"], "on-load restores once after the initial scan");
  dispose();
});

test("an inserted clone with on-load=\"this.restore()\" restores once", async () => {
  const dispose = start();
  localStorage.setItem("clone", "c");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "clone",
    "storable-value": "c",
    "on-load": "this.restore()",
  });
  const seen = restoreCalls(el);
  document.body.appendChild(el);
  await flush();
  assert.deepEqual(seen, ["restore"], "an inserted clone restores exactly once");
  dispose();
});

test("nothing is restored without on-load=\"this.restore()\"", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "saved",
  });
  const seen = restoreCalls(el);
  document.body.appendChild(el);
  await flush();
  assert.deepEqual(seen, [], "connect alone restores nothing; the author opts in via on-load");
  dispose();
});

test("save() writes the slot under the key; typing does not persist", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();

  el.value = "typed";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(localStorage.getItem("draft"), null, "an input event does not persist");

  interact(el, "save");
  assert.equal(localStorage.getItem("draft"), "initial", "save() writes the slot");
  dispose();
});

test("save() never fires restore", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();
  const seen = restoreCalls(el);
  interact(el, "save");
  assert.deepEqual(seen, [], "save() writes without firing restore");
  dispose();
});

test("restore() fires whenever something is stored, carrying the stored string as the declared value", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();
  const values = restoreValues(el);

  interact(el, "restore");
  assert.deepEqual(values, [], "no stored value fires nothing");

  localStorage.setItem("draft", "other");
  interact(el, "restore");
  assert.deepEqual(values, ["other"], "any stored value fires restore carrying it as the declared value");

  localStorage.setItem("draft", "initial");
  interact(el, "restore");
  assert.deepEqual(values, ["other", "initial"], "the authored value is not compared against");
  dispose();
});

test("restore() fires at most one event per call", async () => {
  const dispose = start();
  localStorage.setItem("draft", "initial");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();
  const seen = restoreCalls(el);
  interact(el, "restore");
  assert.deepEqual(seen, ["restore"], "exactly one event per restore() call");
  dispose();
});

test("a literal storable-value is never written by restore", async () => {
  const dispose = start();
  localStorage.setItem("pm", "npm");
  const div = hostElement<HTMLDivElement>("div", {
    "storable-key": "pm",
    "storable-value": "pnpm",
  });
  const values = restoreValues(div);
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.deepEqual(values, ["npm"], "a stored value different from the literal still fires restore");
  assert.equal(div.getAttribute("storable-value"), "pnpm", "the authored attribute is untouched");
  assert.equal(div.innerHTML, "", "a literal slot has no element to write");
  dispose();
});

test("save() on a bare ref stores innerHTML", async () => {
  const dispose = start();
  const cart = hostElement<HTMLDivElement>("div", {
    "storable-key": "cart",
    "storable-value": "#cart",
  });
  cart.id = "cart";
  cart.innerHTML = "<li>one</li><li>two</li>";
  document.body.appendChild(cart);
  await flush();
  interact(cart, "save");
  assert.equal(localStorage.getItem("cart"), "<li>one</li><li>two</li>", "save() stores the contents");
  dispose();
});

test("restore() on a bare ref fires the stored string as the declared value and writes nothing", async () => {
  const dispose = start();
  localStorage.setItem("cart", "<li>one</li><li>two</li>");
  const cart = hostElement<HTMLDivElement>("div", {
    "storable-key": "cart",
    "storable-value": "#cart",
  });
  cart.id = "cart";
  cart.innerHTML = "<li>stale</li>";
  const values = restoreValues(cart);
  document.body.appendChild(cart);
  await flush();
  interact(cart, "restore");
  assert.equal(cart.innerHTML, "<li>stale</li>", "restore() never writes the stored string back");
  assert.deepEqual(values, ["<li>one</li><li>two</li>"], "the event carries the stored string as its value");
  dispose();
});

test("a bare ref on this stores the element's own contents; restore only announces them", async () => {
  const dispose = start();
  const panel = hostElement<HTMLDivElement>("div", {
    "storable-key": "panel",
    "storable-value": "this",
  });
  panel.innerHTML = "<p>kept</p>";
  const values = restoreValues(panel);
  document.body.appendChild(panel);
  await flush();
  interact(panel, "save");
  assert.equal(localStorage.getItem("panel"), "<p>kept</p>");

  panel.innerHTML = "<p>edited</p>";
  interact(panel, "restore");
  assert.equal(panel.innerHTML, "<p>edited</p>", "restore() does not write the element's contents back");
  assert.deepEqual(values, ["<p>kept</p>"], "the event carries what save() stored");
  dispose();
});

test("save() on a property ref stores that property", async () => {
  const dispose = start();
  const field = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "this.value",
  });
  field.value = "hello";
  document.body.appendChild(field);
  await flush();
  interact(field, "save");
  assert.equal(localStorage.getItem("draft"), "hello", "save() stores the property");
  dispose();
});

test("restore() on a property ref fires the stored string as its value and writes nothing", async () => {
  const dispose = start();
  localStorage.setItem("draft", "hello");
  const field = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "this.value",
  });
  const values = restoreValues(field);
  document.body.appendChild(field);
  await flush();
  interact(field, "restore");
  assert.equal(field.value, "", "restore() never writes the stored string into the property");
  assert.deepEqual(values, ["hello"], "the event carries the stored string");
  dispose();
});

test("a property ref targets the element a #id names", async () => {
  const dispose = start();
  const other = document.createElement("input");
  other.id = "other";
  document.body.appendChild(other);
  const button = hostElement<HTMLButtonElement>("button", {
    "storable-key": "draft",
    "storable-value": "#other.value",
  });
  document.body.appendChild(button);
  await flush();

  other.value = "x";
  interact(button, "save");
  assert.equal(localStorage.getItem("draft"), "x", "save() reads the targeted element's property");

  localStorage.setItem("draft", "y");
  interact(button, "restore");
  assert.equal(other.value, "x", "restore() writes nothing to the targeted element's property");
  dispose();
});

test("innerHTML is not reachable as a property: storable-value=\"this.innerHTML\" is a literal", async () => {
  const dispose = start();
  const div = hostElement<HTMLDivElement>("div", {
    "storable-key": "draft",
    "storable-value": "this.innerHTML",
  });
  div.innerHTML = "<p>kept</p>";
  document.body.appendChild(div);
  await flush();
  interact(div, "save");
  assert.equal(
    localStorage.getItem("draft"),
    "this.innerHTML",
    "a non-readable property ref is stored as the literal string",
  );

  div.innerHTML = "<p>edited</p>";
  interact(div, "restore");
  assert.equal(div.innerHTML, "<p>edited</p>", "restore() never writes markup through a property");
  dispose();
});

test("a missing ref target throws on save() but restore() still announces the value", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const div = hostElement<HTMLDivElement>("div", {
    "storable-key": "draft",
    "storable-value": "#ghost",
  });
  const seen = restoreCalls(div);
  document.body.appendChild(div);
  await flush();

  const saveEvent = interact(div, "save");
  assert.ok(saveEvent.error instanceof Error, "save() fails when the ref target cannot be resolved");

  const restoreEvent = interact(div, "restore");
  assert.equal(restoreEvent.error, undefined, "restore() never resolves the slot");
  assert.deepEqual(seen, ["restore"], "restore fires the value even when the ref target is missing");
  dispose();
});

test("clear() removes the key; the next restore fires nothing", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "saved",
    "on-load": "this.restore()",
  });
  const seen = restoreCalls(el);
  document.body.appendChild(el);
  await flush();
  assert.deepEqual(seen, ["restore"]);

  interact(el, "clear");
  assert.equal(localStorage.getItem("draft"), null, "clear() removes the key");

  interact(el, "restore");
  assert.deepEqual(seen, ["restore"], "a cleared key restores nothing further");
  dispose();
});

test("session scope uses sessionStorage; the default uses localStorage", async () => {
  const dispose = start();
  sessionStorage.setItem("secret", "sessioned");
  const session = hostElement<HTMLInputElement>("input", {
    "storable-scope": "session",
    "storable-key": "secret",
    "storable-value": "sessioned",
  });
  document.body.appendChild(session);
  await flush();
  const sessionSeen = restoreCalls(session);
  interact(session, "restore");
  assert.deepEqual(sessionSeen, ["restore"], "the session scope reads sessionStorage");

  interact(session, "save");
  assert.equal(sessionStorage.getItem("secret"), "sessioned");
  assert.equal(localStorage.getItem("secret"), null, "localStorage is untouched");

  localStorage.setItem("secret", "localed");
  const local = hostElement<HTMLInputElement>("input", {
    "storable-key": "secret",
    "storable-value": "localed",
  });
  document.body.appendChild(local);
  await flush();
  const localSeen = restoreCalls(local);
  interact(local, "restore");
  assert.deepEqual(localSeen, ["restore"], "the default scope reads localStorage");
  dispose();
});

test("missing storable-key is a signature error at attach naming the attribute", async () => {
  const dispose = start();
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  try {
    const el = hostElement<HTMLDivElement>("div", {
      implements: "storable",
      "storable-value": "v",
    });
    document.body.appendChild(el);
    await flush();
  } finally {
    console.error = original;
  }
  assert.ok(errors.length >= 1, "attach reports a signature error");
  assert.ok(errors.some((m) => m.includes("storable-key")), "the error names the attribute");
  dispose();
});

test("missing storable-value is a signature error at attach naming the attribute", async () => {
  const dispose = start();
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  try {
    const el = hostElement<HTMLDivElement>("div", {
      implements: "storable",
      "storable-key": "k",
    });
    document.body.appendChild(el);
    await flush();
  } finally {
    console.error = original;
  }
  assert.ok(errors.length >= 1, "attach reports a signature error");
  assert.ok(errors.some((m) => m.includes("storable-value")), "the error names the attribute");
  dispose();
});

test("storage throwing does not break save, restore or clear", async () => {
  const originalLocal = globalThis.localStorage;
  const originalSession = globalThis.sessionStorage;
  const throwing = {
    get length() {
      return 0;
    },
    clear: () => {
      throw new Error("denied");
    },
    getItem: () => {
      throw new Error("denied");
    },
    key: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
  } as Storage;
  globalThis.localStorage = throwing;
  globalThis.sessionStorage = throwing;
  try {
    const dispose = start();
    const el = hostElement<HTMLInputElement>("input", {
      "storable-key": "draft",
      "storable-value": "initial",
    });
    document.body.appendChild(el);
    await flush();
    interact(el, "save");
    interact(el, "restore");
    interact(el, "clear");
    assert.equal(el.isConnected, true, "save, restore and clear survive storage failures");
    dispose();
  } finally {
    globalThis.localStorage = originalLocal;
    globalThis.sessionStorage = originalSession;
  }
});

test("a key holds one value: a later save() under the same key overwrites", async () => {
  const dispose = start();
  const a = hostElement<HTMLButtonElement>("button", {
    "storable-key": "mode",
    "storable-value": "light",
    "on-click": "this.save()",
  });
  const b = hostElement<HTMLButtonElement>("button", {
    "storable-key": "mode",
    "storable-value": "dark",
    "on-click": "this.save()",
  });
  document.body.append(a, b);
  await flush();

  a.click();
  assert.equal(localStorage.getItem("mode"), "light");
  b.click();
  assert.equal(localStorage.getItem("mode"), "dark", "the last save() wins");
  dispose();
});

test("save() then restore() round-trips a property ref", async () => {
  const dispose = start();
  const field = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "this.value",
  });
  document.body.appendChild(field);
  await flush();

  field.value = "first";
  interact(field, "save");
  const values = restoreValues(field);
  field.value = "second";
  interact(field, "restore");
  assert.equal(field.value, "second", "restore() never writes the property");
  assert.deepEqual(values, ["first"], "the round trip fires restore with the stored string");
  dispose();
});

test("restore event routes through the element and is catchable, never a native change", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "saved",
  });
  const seen: string[] = [];
  el.addEventListener("restore", () => seen.push("restore"));
  el.addEventListener("change", () => seen.push("change"));
  document.body.appendChild(el);
  await flush();
  interact(el, "restore");
  assert.deepEqual(seen, ["restore"], "restore fires one restore and no native change");
  dispose();
});

test("restore carries the stored string as its declared value and never as a key", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "saved",
  });
  const seen: Array<{ key: string | undefined; value: string | undefined }> = [];
  el.addEventListener("restore", (e) => {
    const event = e as ImplementationEvent;
    seen.push({ key: event.key, value: event.values["value"] });
  });
  document.body.appendChild(el);
  await flush();
  interact(el, "restore");
  assert.deepEqual(seen, [{ key: undefined, value: "saved" }], "restore dispatches only the declared value");
  dispose();
});

test("an on-restore phrase resolves the declared value by name and writes nothing", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const holder = document.createElement("div");
  holder.innerHTML =
    `<div implements="storable attributable" storable-key="draft" storable-value="saved" ` +
    `on-restore(value:string)="this.setAttr({name: 'data-restored', value: value})"></div>`;
  const div = holder.firstElementChild as HTMLDivElement;
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.equal(
    div.getAttribute("data-restored"),
    "saved",
    "the phrase receives the stored string as the declared value",
  );
  assert.equal(div.innerHTML, "", "restore writes nothing on its own");
  dispose();
});