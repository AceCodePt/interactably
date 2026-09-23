import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import {
  allObservedAttributes,
  ensureImplementation,
  getImplementationDef,
  getObservedAttributes,
  registerImplementation,
} from "@behaviors/implementation-registry.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("registration, lookup, and observed attributes", () => {
  defineImplementation(
    "registry-demo",
    {
      tags: ["input"],
      config: { step: "number | undefined" },
      state: { open: "boolean | undefined" },
      verbs: { set: "string" },
    },
    (_el) => ({ set: () => undefined }),
  );
  const def = getImplementationDef("registry-demo");
  assert.ok(def !== undefined);
  assert.deepEqual(getObservedAttributes(def), ["registry-demo-step", "registry-demo-open"]);
  assert.ok(allObservedAttributes().includes("registry-demo-step"));
  assert.ok(allObservedAttributes().includes("registry-demo-open"));
});

test("registration re-runs the ensure pass on the attached set and defines no custom element", async () => {
  const { start } = await import("@interactable/start.ts");
  const { isAttached } = await import("@interactable/attachment.ts");
  const dispose = start();
  const el = document.createElement("div");
  el.setAttribute("implements", "registry-live");
  document.body.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(isAttached(el), true, "a participant attaches even before its implementation is registered");
  assert.equal(getImplementationDef("registry-live"), undefined, "the name is genuinely unregistered");

  defineImplementation(
    "registry-late",
    { tags: ["div"], verbs: { ping: "undefined" } },
    () => ({ ping: () => undefined }),
  );
  const late = document.createElement("div");
  late.setAttribute("implements", "registry-late");
  document.body.appendChild(late);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { getAttachment } = await import("@interactable/attachment.ts");
  assert.ok(getAttachment(late)?.implementations.has("registry-late"), "a later registration attaches to an element that was pending");
  assert.equal(customElements.get("interactable-div"), undefined, "registration defines no custom element");
  dispose();
});

test("state keys are namespaced per implementation, so two definitions may reuse a key name", () => {
  defineImplementation(
    "registry-state-a",
    { state: { open: "boolean | undefined" }, verbs: {} },
    () => ({}),
  );
  assert.doesNotThrow(() =>
    defineImplementation(
      "registry-state-b",
      { state: { open: "string | undefined" }, verbs: {} },
      () => ({}),
    ),
  );
  const a = getImplementationDef("registry-state-a");
  const b = getImplementationDef("registry-state-b");
  assert.ok(a !== undefined && b !== undefined);
  assert.deepEqual(getObservedAttributes(a), ["registry-state-a-open"]);
  assert.deepEqual(getObservedAttributes(b), ["registry-state-b-open"]);
});

test("a definition cannot declare the same key as both config and state", () => {
  assert.throws(
    () =>
      defineImplementation(
        "registry-collide",
        { config: { open: "boolean | undefined" }, state: { open: "boolean | undefined" }, verbs: {} },
        () => ({}),
      ),
    /"open" is declared as both config \(/,
  );
});

test("throws when two same-tag definitions declare the same event", () => {
  defineImplementation(
    "registry-event-a",
    { tags: ["div"], events: { settled: {} }, verbs: {} },
    () => ({}),
  );
  assert.throws(
    () =>
      defineImplementation(
        "registry-event-b",
{ tags: ["div"], events: { settled: {} }, verbs: {} },
        () => ({}),
      ),
    /event "settled" is registered by both "registry-event-a" and "registry-event-b"/,
  );
});

test("a tag-less definition collides with any same-event definition; disjoint tags do not", () => {
  defineImplementation(
    "registry-event-c",
    { tags: ["section"], events: { settled: {} }, verbs: {} },
    () => ({}),
  );
  assert.throws(
    () =>
      defineImplementation(
        "registry-event-d",
        { events: { settled: {} }, verbs: {} },
        () => ({}),
      ),
    /event "settled" is registered by both/,
  );
  assert.doesNotThrow(() =>
    defineImplementation(
      "registry-event-e",
      { tags: ["input"], events: { settled: {} }, verbs: {} },
      () => ({}),
    ),
  );
  assert.doesNotThrow(() =>
    defineImplementation(
      "registry-event-f",
      { tags: ["button"], events: { done: {} }, verbs: {} },
      () => ({}),
    ),
  );
});

test("ensureImplementation returns one instance per element and name", async () => {
  defineImplementation(
    "registry-ensure",
    { tags: ["div"], config: { level: "number | undefined" }, verbs: { report: "undefined" } },
    (_el, attrs) => ({ report: () => attrs.level }),
  );
  const el = document.createElement("div");
  el.setAttribute("registry-ensure-level", "3");
  const def = getImplementationDef("registry-ensure");
  assert.ok(def !== undefined);
  const first = ensureImplementation(el, "registry-ensure", def);
  const second = ensureImplementation(el, "registry-ensure", def);
  assert.strictEqual(first, second);
  const other = document.createElement("div");
  const third = ensureImplementation(other, "registry-ensure", def);
  assert.notStrictEqual(first, third);
});

test("registerImplementation exposes the compiled verb signatures to the host", () => {
  const def = getImplementationDef("registry-ensure");
  if (def === undefined) throw new Error("registry-ensure not registered");
  const report = def.verbs["report"];
  if (report === undefined) throw new Error("report verb not compiled");
  assert.equal(report.validate(undefined), undefined);
  assert.throws(() => report.validate(5));
});

test("registerImplementation refuses a duplicate name", () => {
  assert.throws(() =>
    registerImplementation({
      name: "registry-ensure",
      tags: undefined,
      config: {},
      state: {},
      verbs: {},
      events: {},
      factory: () => ({}),
    }),
  );
});