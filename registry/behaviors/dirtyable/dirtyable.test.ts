import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/dirtyable/dirtyable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
  await import("@behaviors/storable/storable.ts");
  await import("@behaviors/attributable/attributable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(el: Element, verb: string, arg?: unknown): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

function track(el: Element): string[] {
  const events: string[] = [];
  el.addEventListener("dirty", () => events.push("dirty"));
  el.addEventListener("clean", () => events.push("clean"));
  return events;
}

test("a text input fires exactly one dirty, one clean and one dirty across char/delete/two-chars", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", { implements: "dirtyable", value: "a" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);
  assert.deepEqual(events, []);

  input.value = "ab";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);

  input.value = "a";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean"]);

  input.value = "abc";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean", "dirty"]);

  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean", "dirty"]);
  dispose();
});

test("dirty-on=\"change\" evaluates on change, not input", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", {
    implements: "dirtyable",
    value: "a",
    "dirtyable-dirty-on": "change",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, []);

  input.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);
  dispose();
});

test("a checkbox toggles against its defaultChecked", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const box = hostElement("input", {
    implements: "dirtyable",
    type: "checkbox",
    checked: "",
  }) as HTMLInputElement;
  document.body.appendChild(box);
  await flush();

  const events = track(box);

  box.checked = false;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);

  box.checked = true;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean"]);
  dispose();
});

test("radio: only the radio whose checked diverges from its default fires", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const a = hostElement("input", {
    implements: "dirtyable",
    type: "radio",
    name: "group",
    checked: "",
  }) as HTMLInputElement;
  const b = hostElement("input", {
    implements: "dirtyable",
    type: "radio",
    name: "group",
  }) as HTMLInputElement;
  document.body.append(a, b);
  await flush();

  const eventsA = track(a);
  const eventsB = track(b);

  b.checked = true;
  b.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(eventsA, [], "the still-selected radio stays clean");
  assert.deepEqual(eventsB, ["dirty"]);
  dispose();
});

test("a single select is dirty when its selection diverges from defaultSelected", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const select = hostElement("select", { implements: "dirtyable" }) as HTMLSelectElement;
  select.innerHTML = "<option value='a' selected>A</option><option value='b'>B</option>";
  document.body.appendChild(select);
  await flush();

  const events = track(select);

  select.value = "b";
  select.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);

  select.value = "a";
  select.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean"]);
  dispose();
});

test("a multi select is dirty when only the second option differs from its default", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const select = hostElement("select", { implements: "dirtyable", multiple: "" }) as HTMLSelectElement;
  select.innerHTML = "<option value='a' selected>A</option><option value='b'>B</option>";
  document.body.appendChild(select);
  await flush();

  const events = track(select);

  select.options[1]!.selected = true;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);

  select.options[1]!.selected = false;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean"]);
  dispose();
});

test("a script moving the value attribute re-evaluates via the attribute observer", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", { implements: "dirtyable", value: "a" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"], "a user edit diverges from the authored baseline");

  input.setAttribute("value", "b");
  await flush();
  assert.deepEqual(events, ["dirty", "clean"], "the attribute observer re-baselines against the new default");
  dispose();
});

test("moving the baseline via setAttr commits the current state and fires clean", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", {
    implements: "dirtyable attributable",
    value: "a",
    "on-dirty": "this.setAttr({name: 'value', value: this.value})",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
  assert.deepEqual(events.slice().sort(), ["clean", "dirty"], "typing dirties and the on-dirty baseline move commits it");

  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
  assert.equal(events.length, 2, "an unchanged input fires nothing once committed");

  input.value = "c";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
  assert.deepEqual(
    events.slice().sort(),
    ["clean", "clean", "dirty", "dirty"],
    "diverging from the moved baseline dirties and the phrase commits again",
  );
  dispose();
});

test("an on-restore baseline move after a restore counts as pristine", async () => {
  localStorage.setItem("draft", "initial");
  const dispose = (await import("@interactable/start.ts")).start();
  const holder = document.createElement("div");
  holder.innerHTML =
    `<input implements="dirtyable storable modifiable attributable" storable-key="draft" storable-value="initial" ` +
    `on-restore(value:string)="this.set(value).setAttr({name: 'value', value: value})">`;
  const input = holder.firstElementChild as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);

  input.value = "edited";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);

  interact(input, "restore");
  await flush();
  assert.deepEqual(events, ["dirty", "clean"], "a restore that re-baselines counts as pristine");
  dispose();
});

test("no class or attribute is ever written to the element", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", {
    implements: "dirtyable attributable",
    value: "a",
    "on-dirty": "this.setAttr({name: 'data-dirty', value: ''})",
    "on-clean": "this.removeAttr('data-dirty')",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);
  assert.equal(input.getAttribute("class"), null);

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"], "on-dirty is a recognised trigger attribute");
  assert.equal(input.hasAttribute("data-dirty"), true, "the author's phrase paints the effect");
  assert.equal(input.getAttribute("class"), null);
  assert.equal(input.hasAttribute("dirty-state"), false);

  input.value = "a";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty", "clean"], "on-clean is a recognised trigger attribute");
  assert.equal(input.hasAttribute("data-dirty"), false);
  assert.equal(input.getAttribute("class"), null);
  dispose();
});

test("an authored-dirty connect fires nothing; the first flip fires clean", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", {
    implements: "dirtyable attributable",
    value: "a",
    "on-dirty": "this.setAttr({name: 'data-dirty', value: ''})",
    "on-clean": "this.removeAttr('data-dirty')",
  }) as HTMLInputElement;
  input.value = "b";
  document.body.appendChild(input);
  await flush();

  const events = track(input);
  assert.equal(input.hasAttribute("data-dirty"), false, "no event fires at connect");
  assert.deepEqual(events, []);

  input.value = "a";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["clean"], "the first transition is dirty→clean");
  assert.equal(input.hasAttribute("data-dirty"), false);
  dispose();
});

test("a file input with a value reads as dirty", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const file = hostElement("input", { implements: "dirtyable", type: "file" }) as HTMLInputElement;
  document.body.appendChild(file);
  await flush();

  const events = track(file);

  Object.defineProperty(file, "value", {
    configurable: true,
    value: "C:\\fakepath\\plan.pdf",
  });
  file.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(events, ["dirty"]);
  dispose();
});

test("a library write through modifiable dirties via the interaction event; reset clears it", async () => {
  const dispose = (await import("@interactable/start.ts")).start();
  const input = hostElement("input", {
    implements: "modifiable dirtyable",
    value: "1",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  const events = track(input);

  interact(input, "set", 2);
  assert.equal(input.value, "2");
  assert.deepEqual(events, ["dirty"]);

  interact(input, "reset");
  assert.equal(input.value, "1");
  assert.deepEqual(events, ["dirty", "clean"]);
  dispose();
});