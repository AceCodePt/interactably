import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

before(async () => {
  dom = setupJsdom();
  setReadyState("complete");
  await import("@behaviors/storable/storable.ts");
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("input");
  defineInteractableHost("select");
  defineInteractableHost("textarea");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  setReadyState("complete");
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
});

type Field =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

function field<T extends Field>(tag: "input" | "select" | "textarea", attributes: Record<string, string>): T {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as T;
  el.setAttribute("implements", "storable");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function changeEvents(el: Element): string[] {
  const seen: string[] = [];
  el.addEventListener("change", () => seen.push("change"));
  return seen;
}

test("a text field restores from localStorage and fires one change", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
  const seen = changeEvents(el);
  document.body.appendChild(el);
  assert.equal(el.value, "saved", "restores immediately when the document is ready");
  assert.deepEqual(seen, ["change"], "the restore fires one native change");
});

test("an unchanged value restores without a change event", async () => {
  localStorage.setItem("interactable:draft", "same");
  const el = field<HTMLInputElement>("input", { name: "draft", value: "same" });
  const seen = changeEvents(el);
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "same");
  assert.deepEqual(seen, [], "no change when the stored value matches");
});

test("a radio group of three restores exactly one change on the selected radio", async () => {
  localStorage.setItem("interactable:manager", JSON.stringify(["pnpm"]));
  const r1 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "npm" });
  const r2 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "pnpm" });
  const r3 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "yarn" });
  const seen: string[] = [];
  for (const r of [r1, r2, r3]) r.addEventListener("change", () => seen.push(r.value));
  document.body.append(r1, r2, r3);
  await flush();
  assert.equal(r2.checked, true, "the stored radio is checked");
  assert.equal(r1.checked, false);
  assert.equal(r3.checked, false);
  assert.deepEqual(seen, ["pnpm"], "exactly one change, on the stored radio");
});

test("two checkboxes with one name store and restore as a list", async () => {
  const c1 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const c2 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(c1, c2);
  await flush();

  c1.checked = true;
  c1.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:tags"), JSON.stringify(["a"]), "a checked control is stored as a list");

  c2.checked = true;
  c2.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:tags"), JSON.stringify(["a", "b"]), "the list grows in DOM order");

  const d1 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const d2 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(d1, d2);
  await flush();
  assert.equal(d1.checked, true, "the stored checked box restores checked");
  assert.equal(d2.checked, true);
});

test("session scope uses sessionStorage", async () => {
  sessionStorage.setItem("interactable:draft", "secret");
  const el = field<HTMLInputElement>("input", { name: "draft", "storable-scope": "session" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "secret", "restores from sessionStorage");

  el.value = "other";
  el.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(sessionStorage.getItem("interactable:draft"), "other");
  assert.equal(localStorage.getItem("interactable:draft"), null, "localStorage is untouched");
});

test("storable-key overrides the name in the storage key", async () => {
  localStorage.setItem("interactable:custom", "keyed");
  const el = field<HTMLInputElement>("input", { name: "real-name", "storable-key": "custom" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "keyed", "restores from the keyed storage slot");
  assert.equal(localStorage.getItem("interactable:real-name"), null, "the name is not used");

  el.value = "typed";
  el.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:custom"), "typed");
});

test("a field with no name and no key warns once and does nothing", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const el = field<HTMLInputElement>("input", {});
    document.body.appendChild(el);
    await flush();
    el.value = "typed";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    assert.equal(localStorage.length, 0, "nothing is stored");
    assert.equal(warnings.length, 1, "warns once");
    assert.match(warnings[0]!, /storable/);
  } finally {
    console.warn = originalWarn;
  }
});

test("storage throwing does not break connect", async () => {
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
    const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
    document.body.appendChild(el);
    await flush();
    assert.equal(el.value, "initial", "a failed read leaves the authored value");
    el.value = "typed";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    assert.equal(el.isConnected, true, "connect and change survive storage failures");
  } finally {
    globalThis.localStorage = originalLocal;
    globalThis.sessionStorage = originalSession;
  }
});

test("authored checked is overridden by the stored value", async () => {
  localStorage.setItem("interactable:consent", JSON.stringify([]));
  const el = field<HTMLInputElement>("input", { type: "checkbox", name: "consent", checked: "" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.checked, false, "the stored unchecked state overrides the authored checked attribute");
});

test("while readyState is loading, restore defers until DOMContentLoaded", async () => {
  setReadyState("loading");
  localStorage.setItem("interactable:draft", "saved");
  const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
  const seen = changeEvents(el);
  document.body.appendChild(el);
  assert.equal(el.value, "initial", "restore waits while the document is still parsing");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  assert.equal(el.value, "saved", "restore runs when the document finishes parsing");
  assert.deepEqual(seen, ["change"], "the deferred restore fires its change");
});

test("the deferred restore skips when the element disconnects before DOMContentLoaded", async () => {
  setReadyState("loading");
  localStorage.setItem("interactable:draft", "saved");
  const el = field<HTMLInputElement>("input", { name: "draft" });
  document.body.appendChild(el);
  el.remove();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  assert.equal(el.value, "", "a disconnected element is not restored");
});