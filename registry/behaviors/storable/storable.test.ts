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
  await import("@behaviors/revealable/revealable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("input");
  defineInteractableHost("select");
  defineInteractableHost("textarea");
  defineInteractableHost("div");
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

test("no stored value restores nothing and leaves the authored value", async () => {
  const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
  const seen = changeEvents(el);
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "initial", "the authored value is untouched");
  assert.deepEqual(seen, [], "no change fires without a stored value");
});

test("a radio group of three restores exactly one change on the stored radio", async () => {
  localStorage.setItem("interactable:manager", JSON.stringify(["pnpm"]));
  const r1 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "npm", checked: "" });
  const r2 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "pnpm" });
  const r3 = field<HTMLInputElement>("input", { type: "radio", name: "manager", value: "yarn" });
  const seen: string[] = [];
  for (const r of [r1, r2, r3]) r.addEventListener("change", () => seen.push(r.value));
  document.body.append(r1, r2, r3);
  await flush();
  assert.equal(r2.checked, true, "the stored radio is checked");
  assert.equal(r1.checked, false, "the authored checked is overridden");
  assert.equal(r3.checked, false);
  assert.deepEqual(seen, ["pnpm"], "exactly one change, on the stored radio");
});

test("two same-name checkboxes save() as a list and restore both", async () => {
  const c1 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const c2 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(c1, c2);
  await flush();

  c1.checked = true;
  c2.checked = true;
  interact(c1, "save");
  assert.equal(localStorage.getItem("interactable:tags"), JSON.stringify(["a", "b"]), "save() on either writes the list");

  const d1 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "a" });
  const d2 = field<HTMLInputElement>("input", { type: "checkbox", name: "tags", value: "b" });
  document.body.append(d1, d2);
  await flush();
  assert.equal(d1.checked, true, "the stored checked box restores checked");
  assert.equal(d2.checked, true);
});

test("a same-name radio in a different form is excluded from the saved array", async () => {
  const form1 = document.createElement("form");
  const form2 = document.createElement("form");
  const r1 = field<HTMLInputElement>("input", { type: "radio", name: "g", value: "a" });
  const r2 = field<HTMLInputElement>("input", { type: "radio", name: "g", value: "b" });
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
  const el = field<HTMLInputElement>("input", { name: "draft", "storable-scope": "session" });
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
  const el = field<HTMLInputElement>("input", { id: "by-id", name: "real-name", "storable-key": "custom" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "keyed", "restores from the keyed storage slot");
  assert.equal(localStorage.getItem("interactable:real-name"), null, "the name is not used");
  assert.equal(localStorage.getItem("interactable:by-id"), null, "the id is not used");

  el.value = "typed";
  interact(el, "save");
  assert.equal(localStorage.getItem("interactable:custom"), "typed");

  localStorage.setItem("interactable:real-name", "name-keyed");
  const viaName = field<HTMLInputElement>("input", { id: "by-id", name: "real-name" });
  document.body.appendChild(viaName);
  await flush();
  assert.equal(viaName.value, "name-keyed", "name beats id");

  localStorage.setItem("interactable:by-id", "id-keyed");
  const viaId = field<HTMLInputElement>("input", { id: "by-id" });
  document.body.appendChild(viaId);
  await flush();
  assert.equal(viaId.value, "id-keyed", "id is the fallback when name is absent");
});

test("a field with no storable-key, no name and no id warns once and stores nothing", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const el = field<HTMLInputElement>("input", {});
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
  const el = field<HTMLInputElement>("input", { name: "draft" });
  document.body.appendChild(el);
  await flush();

  el.value = "typed";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:draft"), null, "an input event does not persist");

  interact(el, "save");
  assert.equal(localStorage.getItem("interactable:draft"), "typed", "save() writes the value");
});

test("load() after typing reverts to the stored value and fires change", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "saved");

  const seen = changeEvents(el);
  el.value = "edited";
  interact(el, "load");
  assert.equal(el.value, "saved", "load() reverts the edit");
  assert.deepEqual(seen, ["change"], "the load fires a native change");
});

test("clear() removes the key and a subsequent connect restores nothing", async () => {
  localStorage.setItem("interactable:draft", "saved");
  const el = field<HTMLInputElement>("input", { name: "draft" });
  document.body.appendChild(el);
  await flush();
  assert.equal(el.value, "saved");

  interact(el, "clear");
  assert.equal(localStorage.getItem("interactable:draft"), null, "clear() removes the key");

  el.remove();
  const fresh = field<HTMLInputElement>("input", { name: "draft" });
  const seen = changeEvents(fresh);
  document.body.appendChild(fresh);
  await flush();
  assert.equal(fresh.value, "", "a cleared key restores nothing");
  assert.deepEqual(seen, [], "no change fires");
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
    const el = field<HTMLInputElement>("input", { name: "draft", value: "initial" });
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

test("a stored radio's restore opens its revealable panels through the on-change phrase", async () => {
  setReadyState("loading");
  localStorage.setItem("interactable:pm", JSON.stringify(["pnpm"]));

  const npm = field<HTMLInputElement>("input", {
    type: "radio",
    name: "pm",
    value: "npm",
    id: "pm-npm",
    checked: "",
    "on-change": "#install-npm.show(); #config-npm.show(); #trouble-npm.show(); this.save()",
  });
  const pnpm = field<HTMLInputElement>("input", {
    type: "radio",
    name: "pm",
    value: "pnpm",
    id: "pm-pnpm",
    "on-change": "#install-pnpm.show(); #config-pnpm.show(); #trouble-pnpm.show(); this.save()",
  });
  const panels = (id: string, open: boolean): HTMLDivElement => {
    const el = document.createElement("div", { is: "interactable-div" }) as HTMLDivElement;
    el.id = id;
    el.setAttribute("implements", "revealable");
    if (open) el.setAttribute("data-open", "true");
    else el.setAttribute("hidden", "");
    return el;
  };
  document.body.append(
    npm,
    pnpm,
    panels("install-npm", true),
    panels("config-npm", true),
    panels("trouble-npm", true),
    panels("install-pnpm", false),
    panels("config-pnpm", false),
    panels("trouble-pnpm", false),
  );

  document.dispatchEvent(new Event("DOMContentLoaded"));
  assert.equal(pnpm.checked, true, "the stored radio is restored checked");
  assert.equal(npm.checked, false, "the authored npm selection is overridden");
  assert.equal(byId("install-pnpm").hidden, false, "the stored radio's panel opens");
  assert.equal(byId("config-pnpm").hidden, false);
  assert.equal(byId("trouble-pnpm").hidden, false);
  assert.equal(byId("install-npm").hidden, true, "the sibling's panel closes");
  assert.equal(byId("config-npm").hidden, true);
  assert.equal(byId("trouble-npm").hidden, true);
  assert.equal(localStorage.getItem("interactable:pm"), JSON.stringify(["pnpm"]), "the restore's on-change phrase re-saves the selection");

  function byId(id: string): HTMLDivElement {
    const el = document.getElementById(id);
    assert.ok(el !== null, `#${id} exists`);
    return el as HTMLDivElement;
  }
});