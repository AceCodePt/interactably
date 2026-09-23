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

function restoreKeys(el: Element): string[] {
  const seen: string[] = [];
  el.addEventListener("restore", (e) => seen.push((e as Event & { key?: string }).key ?? ""));
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

test("restore() fires whenever something is stored, carrying the stored string as the key", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();
  const keys = restoreKeys(el);

  interact(el, "restore");
  assert.deepEqual(keys, [], "no stored value fires nothing");

  localStorage.setItem("draft", "other");
  interact(el, "restore");
  assert.deepEqual(keys, ["other"], "any stored value fires restore carrying it as the key");

  localStorage.setItem("draft", "initial");
  interact(el, "restore");
  assert.deepEqual(keys, ["other", "initial"], "the authored value is not compared against");
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
  const keys = restoreKeys(div);
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.deepEqual(keys, ["npm"], "a stored value different from the literal still fires restore");
  assert.equal(div.getAttribute("storable-value"), "pnpm", "the authored attribute is untouched");
  assert.equal(div.innerHTML, "", "a literal slot has no element to write");
  dispose();
});

test("two elements may share a key: restore fires on both, keyed on-restore phrases filter", async () => {
  const dispose = start();
  localStorage.setItem("pm", "pnpm");
  const a = hostElement<HTMLButtonElement>("button", {
    implements: "storable attributable",
    "storable-key": "pm",
    "storable-value": "pnpm",
    "on-restore": "pnpm: this.setAttr({name: 'data-hit', value: 'pnpm'})",
  });
  const b = hostElement<HTMLButtonElement>("button", {
    implements: "storable attributable",
    "storable-key": "pm",
    "storable-value": "yarn",
    "on-restore": "yarn: this.setAttr({name: 'data-hit', value: 'yarn'})",
  });
  const seenA = restoreCalls(a);
  const seenB = restoreCalls(b);
  document.body.append(a, b);
  await flush();

  interact(a, "restore");
  interact(b, "restore");
  assert.deepEqual(seenA, ["restore"], "the pnpm button fires restore too");
  assert.deepEqual(seenB, ["restore"], "the yarn button fires restore too");
  assert.equal(a.getAttribute("data-hit"), "pnpm", "the pnpm keyed phrase paints");
  assert.equal(b.getAttribute("data-hit"), null, "the yarn keyed phrase does not match");

  localStorage.setItem("pm", "yarn");
  interact(a, "restore");
  interact(b, "restore");
  assert.equal(b.getAttribute("data-hit"), "yarn", "the yarn keyed phrase paints when its key is stored");
  dispose();
});

test("an unkeyed on-restore phrase is skipped on a keyed restore", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const div = hostElement<HTMLDivElement>("div", {
    implements: "storable attributable",
    "storable-key": "draft",
    "storable-value": "saved",
    "on-restore": "this.setAttr({name: 'data-mode', value: 'boom'})",
  });
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.equal(
    div.getAttribute("data-mode"),
    null,
    "a keyed restore event only runs keyed on-restore phrases",
  );
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

test("restore() on a bare ref writes the exact stored string and fires with it as the key", async () => {
  const dispose = start();
  localStorage.setItem("cart", "<li>one</li><li>two</li>");
  const cart = hostElement<HTMLDivElement>("div", {
    "storable-key": "cart",
    "storable-value": "#cart",
  });
  cart.id = "cart";
  cart.innerHTML = "<li>stale</li>";
  const keys = restoreKeys(cart);
  document.body.appendChild(cart);
  await flush();
  interact(cart, "restore");
  assert.equal(cart.innerHTML, "<li>one</li><li>two</li>", "restore() writes the exact string back");
  assert.deepEqual(keys, ["<li>one</li><li>two</li>"], "the event carries the stored string");
  dispose();
});

test("a bare ref on this stores and restores the element's own contents", async () => {
  const dispose = start();
  const panel = hostElement<HTMLDivElement>("div", {
    "storable-key": "panel",
    "storable-value": "this",
  });
  panel.innerHTML = "<p>kept</p>";
  document.body.appendChild(panel);
  await flush();
  interact(panel, "save");
  assert.equal(localStorage.getItem("panel"), "<p>kept</p>");

  panel.innerHTML = "<p>edited</p>";
  interact(panel, "restore");
  assert.equal(panel.innerHTML, "<p>kept</p>", "the element itself is the slot");
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

test("restore() on a property ref writes the exact string into the property", async () => {
  const dispose = start();
  localStorage.setItem("draft", "hello");
  const field = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "this.value",
  });
  const keys = restoreKeys(field);
  document.body.appendChild(field);
  await flush();
  interact(field, "restore");
  assert.equal(field.value, "hello", "restore() writes the stored string into the property");
  assert.deepEqual(keys, ["hello"], "the event carries the stored string");
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
  assert.equal(other.value, "y", "restore() writes the targeted element's property");
  dispose();
});

test("restore() writes the slot before it fires", async () => {
  const dispose = start();
  localStorage.setItem("cart", "<p>fresh</p>");
  const cart = hostElement<HTMLDivElement>("div", {
    "storable-key": "cart",
    "storable-value": "#cart",
  });
  cart.id = "cart";
  cart.innerHTML = "<p>stale</p>";
  const atFire: string[] = [];
  cart.addEventListener("restore", () => atFire.push(cart.innerHTML));
  document.body.appendChild(cart);
  await flush();
  interact(cart, "restore");
  assert.deepEqual(atFire, ["<p>fresh</p>"], "the slot is written before the restore event");
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

test("a missing ref target throws and dispatches nothing", async () => {
  const dispose = start();
  localStorage.setItem("draft", "saved");
  const div = hostElement<HTMLDivElement>("div", {
    "storable-key": "draft",
    "storable-value": "#ghost",
  });
  const seen = restoreCalls(div);
  document.body.appendChild(div);
  await flush();
  const event = interact(div, "restore");
  assert.ok(event.error instanceof Error, "the missing ref fails the verb");
  assert.deepEqual(seen, [], "no restore event fires when the slot cannot be resolved");
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
  const keys = restoreKeys(field);
  field.value = "second";
  interact(field, "restore");
  assert.equal(field.value, "first", "restore() puts back the exact value save() took");
  assert.deepEqual(keys, ["first"], "the round trip fires restore with the stored string");
  dispose();
});

test("a keyed on-restore phrase runs only when its key matches the stored value", async () => {
  const dispose = start();
  localStorage.setItem("mode", "dark");
  const div = hostElement<HTMLDivElement>("div", {
    implements: "storable attributable",
    "storable-key": "mode",
    "storable-value": "dark",
    "on-restore": "dark: this.setAttr({name: 'data-mode', value: 'dark'})",
  });
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.equal(div.getAttribute("data-mode"), "dark", "a matching keyed phrase paints the effect");

  localStorage.setItem("mode", "light");
  div.removeAttribute("data-mode");
  interact(div, "restore");
  assert.equal(
    div.getAttribute("data-mode"),
    null,
    "a different stored value does not run the keyed phrase",
  );
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

test("restore carries the stored string as both the key and the value", async () => {
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
  assert.deepEqual(seen, [{ key: "saved", value: "saved" }], "key dispatch is kept and value is declared alongside");
  dispose();
});