import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

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

test("restore() fires the restore event only when the stored value matches", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();
  const seen = restoreCalls(el);

  interact(el, "restore");
  assert.deepEqual(seen, [], "no stored value fires nothing");

  localStorage.setItem("draft", "other");
  interact(el, "restore");
  assert.deepEqual(seen, [], "a different stored value fires nothing");

  localStorage.setItem("draft", "initial");
  interact(el, "restore");
  assert.deepEqual(seen, ["restore"], "a matching stored value fires restore once");
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

test("the authored storable-value matches rather than writes, on a div", async () => {
  const dispose = start();
  localStorage.setItem("pm", "pnpm");
  const div = hostElement<HTMLDivElement>("div", {
    "storable-key": "pm",
    "storable-value": "pnpm",
  });
  const seen = restoreCalls(div);
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.deepEqual(seen, ["restore"], "a matching stored value fires restore");
  assert.equal(div.getAttribute("storable-value"), "pnpm", "the authored attribute is untouched");

  localStorage.setItem("pm", "npm");
  const mismatch = hostElement<HTMLDivElement>("div", {
    "storable-key": "pm",
    "storable-value": "pnpm",
  });
  const mismatchSeen = restoreCalls(mismatch);
  document.body.appendChild(mismatch);
  await flush();
  interact(mismatch, "restore");
  assert.deepEqual(mismatchSeen, [], "a different stored value changes nothing: authored values are read-only");
  dispose();
});

test("two elements may share one slot: restore matches each authored value", async () => {
  const dispose = start();
  localStorage.setItem("pm", "pnpm");
  const a = hostElement<HTMLButtonElement>("button", {
    "storable-key": "pm",
    "storable-value": "pnpm",
    "on-click": "this.restore()",
  });
  const b = hostElement<HTMLButtonElement>("button", {
    "storable-key": "pm",
    "storable-value": "yarn",
    "on-click": "this.restore()",
  });
  const seenA = restoreCalls(a);
  const seenB = restoreCalls(b);
  document.body.append(a, b);
  await flush();

  a.click();
  assert.deepEqual(seenA, ["restore"], "the matching button restores");
  b.click();
  assert.deepEqual(seenB, [], "the non-matching button restores nothing");
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

test("restore() on the element that saved matches its own authored value", async () => {
  const dispose = start();
  const el = hostElement<HTMLInputElement>("input", {
    "storable-key": "draft",
    "storable-value": "initial",
  });
  document.body.appendChild(el);
  await flush();

  interact(el, "save");
  const seen = restoreCalls(el);
  interact(el, "restore");
  assert.deepEqual(seen, ["restore"], "save-then-restore on the same element matches");
  dispose();
});

test("on-restore runs the author's phrase when a restore matches", async () => {
  const dispose = start();
  localStorage.setItem("mode", "dark");
  const div = hostElement<HTMLDivElement>("div", {
    implements: "storable attributable",
    "storable-key": "mode",
    "storable-value": "dark",
    "on-restore": "this.setAttr({name: 'data-mode', value: 'dark'})",
  });
  document.body.appendChild(div);
  await flush();
  interact(div, "restore");
  assert.equal(div.getAttribute("data-mode"), "dark", "the on-restore phrase paints the effect");
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