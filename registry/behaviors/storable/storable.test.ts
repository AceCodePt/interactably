import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

before(async () => {
  dom = setupJsdom();
  setReadyState("complete");
  await import("@behaviors/storable/storable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("input");
  defineInteractableHost("select");
  defineInteractableHost("textarea");
  defineInteractableHost("div");
  defineInteractableHost("button");
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

function hostElement<T extends HTMLElement>(tag: string, attributes: Record<string, string>): T {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as T;
  el.setAttribute("is", `interactable-${tag}`);
  el.setAttribute("implements", "storable");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function seenOf(el: Element): string[] {
  const seen: string[] = [];
  el.addEventListener("change", () => seen.push("change"));
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

test("a text field restores from localStorage: one restore, never a change", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = hostElement<HTMLInputElement>("input", { name: "draft", value: "initial" });
  const seen = seenOf(el);
  document.body.appendChild(el);
  assert.equal(el.value, "saved", "restores immediately when the document is ready");
  assert.deepEqual(seen, ["restore"], "the restore fires one restore and no native change");
});

test("an unchanged value restores matching and fires restore without writing", async () => {
  localStorage.setItem("interactable:draft", "same");
  const el = hostElement<HTMLInputElement>("input", { name: "draft", value: "same" });
  const seen = seenOf(el);
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "same");
  assert.deepEqual(seen, ["restore"], "a matched value fires restore");
});

test("no stored value restores nothing and leaves the authored value", async () => {
  const el = hostElement<HTMLInputElement>("input", { name: "draft", value: "initial" });
  const seen = seenOf(el);
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "initial", "the authored value is untouched");
  assert.deepEqual(seen, [], "no restore fires without a stored value");
});

test("storable-value outranks a text input's own value", async () => {
  localStorage.setItem("interactable:pm", "pnpm");
  const el = hostElement<HTMLInputElement>("input", { name: "pm", value: "typed", "storable-value": "pnpm" });
  const seen = seenOf(el);
  document.body.appendChild(el);
  await flush();
  assert.deepEqual(seen, ["restore"], "the authored storable-value matched");
  assert.equal(el.value, "typed", "the input's own value is untouched");
});

test("an authored storable-value matches rather than writes: on a button and on a div", async () => {
  const make = (tag: "button" | "div"): HTMLElement =>
    hostElement(tag, { "storable-key": "pm", "storable-value": "pnpm" });

  localStorage.setItem("interactable:pm", "pnpm");
  const button = make("button");
  const div = make("div");
  const seen: string[] = [];
  button.addEventListener("restore", () => seen.push("button"));
  div.addEventListener("restore", () => seen.push("div"));
  document.body.append(button, div);
  await flush();
  assert.deepEqual(seen, ["button", "div"], "both match the stored value and fire restore");
  assert.equal(button.getAttribute("storable-value"), "pnpm", "the authored attribute is untouched");
  assert.equal(div.getAttribute("storable-value"), "pnpm");

  localStorage.setItem("interactable:pm", "npm");
  const mismatch = make("button");
  const mismatchSeen: string[] = [];
  mismatch.addEventListener("restore", () => mismatchSeen.push("restore"));
  document.body.appendChild(mismatch);
  await flush();
  assert.deepEqual(mismatchSeen, [], "a different stored value changes nothing: authored values are read-only");

  localStorage.removeItem("interactable:pm");
  const empty = make("button");
  const emptySeen: string[] = [];
  empty.addEventListener("restore", () => emptySeen.push("restore"));
  document.body.appendChild(empty);
  await flush();
  assert.deepEqual(emptySeen, [], "nothing stored restores nothing");
});

test("an element with no storable-value and no value warns once, save() writes nothing and nothing restores", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const el = hostElement<HTMLDivElement>("div", { "storable-key": "pm" });
    const seen = seenOf(el);
    document.body.appendChild(el);
    await flush();
    assert.equal(warnings.length, 1, "warns once on connect");
    assert.match(warnings[0]!, /storable/);
    assert.match(warnings[0]!, /storable-value/);
    interact(el, "save");
    assert.equal(localStorage.getItem("interactable:pm"), null, "save() writes nothing");
    assert.deepEqual(seen, [], "no restore");
  } finally {
    console.warn = originalWarn;
  }
});

test("three buttons sharing storable-key: the last save() wins", async () => {
  const b1 = hostElement<HTMLButtonElement>("button", { "storable-key": "pm", "storable-value": "npm", "on-click": "this.save()" });
  const b2 = hostElement<HTMLButtonElement>("button", { "storable-key": "pm", "storable-value": "pnpm", "on-click": "this.save()" });
  const b3 = hostElement<HTMLButtonElement>("button", { "storable-key": "pm", "storable-value": "bun", "on-click": "this.save()" });
  document.body.append(b1, b2, b3);
  await flush();

  b1.click();
  assert.equal(localStorage.getItem("interactable:pm"), "npm");
  b2.click();
  assert.equal(localStorage.getItem("interactable:pm"), "pnpm");
  b3.click();
  assert.equal(localStorage.getItem("interactable:pm"), "bun", "the last clicked button's value wins");
});

test("a radio group of three restores exactly one restore on the stored radio", async () => {
  localStorage.setItem("interactable:manager", JSON.stringify(["pnpm"]));
  const r1 = hostElement<HTMLInputElement>("input", { type: "radio", name: "manager", value: "npm", checked: "" });
  const r2 = hostElement<HTMLInputElement>("input", { type: "radio", name: "manager", value: "pnpm" });
  const r3 = hostElement<HTMLInputElement>("input", { type: "radio", name: "manager", value: "yarn" });
  const seen: string[] = [];
  for (const r of [r1, r2, r3]) r.addEventListener("restore", () => seen.push(r.value));
  document.body.append(r1, r2, r3);
  await flush();
  assert.equal(r2.checked, true, "the stored radio is checked");
  assert.equal(r1.checked, false, "the authored checked is overridden");
  assert.equal(r3.checked, false);
  assert.deepEqual(seen, ["pnpm"], "exactly one restore, on the stored radio");
});

test("two same-name checkboxes save() as a list and restore both", async () => {
  const c1 = hostElement<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const c2 = hostElement<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(c1, c2);
  await flush();

  c1.checked = true;
  c2.checked = true;
  interact(c1, "save");
  assert.equal(localStorage.getItem("interactable:tags"), JSON.stringify(["a", "b"]), "save() on either writes the list");

  const d1 = hostElement<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const d2 = hostElement<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(d1, d2);
  await flush();
  assert.equal(d1.checked, true, "the stored checked box restores checked");
  assert.equal(d2.checked, true);
});

test("a same-name radio in a different form is excluded from the saved array", async () => {
  const form1 = document.createElement("form");
  const form2 = document.createElement("form");
  const r1 = hostElement<HTMLInputElement>("input", { type: "radio", name: "g", value: "a" });
  const r2 = hostElement<HTMLInputElement>("input", { type: "radio", name: "g", value: "b" });
  form1.appendChild(r1);
  form2.appendChild(r2);
  document.body.append(form1, form2);
  await flush();

  r1.checked = true;
  r2.checked = true;
  interact(r1, "save");
  assert.equal(localStorage.getItem("interactable:g"), JSON.stringify(["a"]), "only the form-owner radio is stored");
});

test("session scope uses sessionStorage and the default uses localStorage", async () => {
  sessionStorage.setItem("interactable:draft", "secret");
  const el = hostElement<HTMLInputElement>("input", { name: "draft", "storable-scope": "session" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "secret", "restores from sessionStorage");

  el.value = "other";
  interact(el, "save");
  assert.equal(sessionStorage.getItem("interactable:draft"), "other");
  assert.equal(localStorage.getItem("interactable:draft"), null, "localStorage is untouched");
});

test("storable-key overrides name and name overrides id", async () => {
  localStorage.setItem("interactable:custom", "keyed");
  const el = hostElement<HTMLInputElement>("input", { id: "by-id", name: "real-name", "storable-key": "custom" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "keyed", "restores from the keyed storage slot");
  assert.equal(localStorage.getItem("interactable:real-name"), null, "the name is not used");
  assert.equal(localStorage.getItem("interactable:by-id"), null, "the id is not used");

  el.value = "typed";
  interact(el, "save");
  assert.equal(localStorage.getItem("interactable:custom"), "typed");

  localStorage.setItem("interactable:real-name", "name-keyed");
  const viaName = hostElement<HTMLInputElement>("input", { id: "by-id", name: "real-name" });
  document.body.appendChild(viaName);
  await flush();
  assert.equal(viaName.value, "name-keyed", "name beats id");

  localStorage.setItem("interactable:by-id", "id-keyed");
  const viaId = hostElement<HTMLInputElement>("input", { id: "by-id" });
  document.body.appendChild(viaId);
  await flush();
  assert.equal(viaId.value, "id-keyed", "id is the fallback when name is absent");
});

test("an element with no storable-key, no name and no id warns once and stores nothing", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const el = hostElement<HTMLInputElement>("input", {});
    document.body.appendChild(el);
    await flush();
    interact(el, "save");
    assert.equal(localStorage.length, 0, "nothing is stored");
    assert.equal(warnings.length, 1, "warns once");
    assert.match(warnings[0]!, /storable/);
    assert.match(warnings[0]!, /storable-key/);
    assert.match(warnings[0]!, /name/);
    assert.match(warnings[0]!, /id/);
  } finally {
    console.warn = originalWarn;
  }
});

test("typing does not persist; save() does", async () => {
  const el = hostElement<HTMLInputElement>("input", { name: "draft" });
  document.body.appendChild(el);
  await flush();

  el.value = "typed";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:draft"), null, "an input event does not persist");

  interact(el, "save");
  assert.equal(localStorage.getItem("interactable:draft"), "typed", "save() writes the value");
});

test("load() after typing reverts to the stored value and fires restore, never change", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = hostElement<HTMLInputElement>("input", { name: "draft", value: "initial" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "saved");

  el.value = "edited";
  const seen = seenOf(el);
  interact(el, "load");
  assert.equal(el.value, "saved", "load() reverts the edit");
  assert.deepEqual(seen, ["restore"], "the load fires one restore and no change");
});

test("clear() removes the key and a subsequent connect restores nothing", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = hostElement<HTMLInputElement>("input", { name: "draft" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "saved");

  interact(el, "clear");
  assert.equal(localStorage.getItem("interactable:draft"), null, "clear() removes the key");

  el.remove();
  const fresh = hostElement<HTMLInputElement>("input", { name: "draft" });
  const seen = seenOf(fresh);
  document.body.appendChild(fresh);
  await flush();
  assert.equal(fresh.value, "", "a cleared key restores nothing");
  assert.deepEqual(seen, [], "no restore fires");
});

test("storage throwing does not break connect or save", async () => {
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
    const el = hostElement<HTMLInputElement>("input", { name: "draft", value: "initial" });
    document.body.appendChild(el);
    await flush();
    assert.equal(el.value, "initial", "a failed read leaves the authored value");
    el.value = "typed";
    interact(el, "save");
    assert.equal(el.isConnected, true, "connect and save survive storage failures");
  } finally {
    globalThis.localStorage = originalLocal;
    globalThis.sessionStorage = originalSession;
  }
});

test("authored checked is overridden by the stored value", async () => {
  localStorage.setItem("interactable:consent", JSON.stringify([]));
  const el = hostElement<HTMLInputElement>("input", { type: "checkbox", name: "consent", checked: "" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.checked, false, "the stored unchecked state overrides the authored checked attribute");
});

