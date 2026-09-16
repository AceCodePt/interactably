import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { defineInteractableHost } from "@behaviors/interactable-host.ts";
import { getImplementationDef } from "@behaviors/implementation-registry.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("defines a tags-bearing implementation's host even when the observed-attribute union is empty", () => {
  const def = defineImplementation("empty-union", { tags: ["section"], verbs: { go: "undefined" } }, () => ({
    go: () => undefined,
  }));
  assert.equal(def.name, "empty-union");
  assert.equal(getImplementationDef("empty-union")?.name, "empty-union");
  assert.notEqual(customElements.get("interactable-section"), undefined);
});

test("registers a definition that the registry can look up", () => {
  const def = defineImplementation(
    "lookup",
    {
      tags: ["input"],
      config: { step: "number | undefined" },
      state: { active: "boolean | undefined" },
      verbs: { set: "string", clear: "undefined" },
    },
    (_el, attrs) => ({
      set: (_e, value) => {
        void attrs.step;
        void attrs.active;
        void value;
      },
      clear: () => undefined,
    }),
  );
  assert.equal(def.name, "lookup");
  assert.equal(getImplementationDef("lookup")?.name, "lookup");
  assert.deepEqual(getImplementationDef("lookup")?.tags, ["input"]);
});

test("throws on a malformed tsyntax signature at definition time", () => {
  const badConfig = "banana" as unknown as "number | undefined";
  const badVerb = "string |" as unknown as "undefined";
  assert.throws(() =>
    defineImplementation("bad-config", { config: { x: badConfig }, verbs: {} }, () => ({})),
  );
  assert.throws(() =>
    defineImplementation("bad-verb", { verbs: { go: badVerb } }, () => ({ go: () => undefined })),
  );
});

test("throws on a duplicate name", () => {
  defineImplementation("dup", { verbs: { a: "undefined" } }, () => ({ a: () => undefined }));
  assert.throws(() =>
    defineImplementation("dup", { verbs: { a: "undefined" } }, () => ({ a: () => undefined })),
  );
});

test("the reserved modifier names cannot be verbs", () => {
  for (const verb of ["debounce", "throttle", "once", "delay"]) {
    assert.throws(
      () =>
        defineImplementation(`reserved-${verb}`, { verbs: { [verb]: "undefined" } }, () => ({
          [verb]: () => undefined,
        })),
      new RegExp(`"${verb}" is a reserved modifier and cannot be a verb`),
    );
  }
});

test("an element-constructor slot is not a tsyntax string and compiles to instanceof", () => {
  defineImplementation(
    "with-ctor",
    { verbs: { adopt: HTMLElement } },
    (_el) => ({ adopt: (_e, node) => void node }),
  );
  const verb = getImplementationDef("with-ctor")?.verbs["adopt"];
  assert.ok(verb !== undefined);
  const node = document.createElement("div");
  assert.strictEqual(verb.validate(node), node);
  assert.throws(() => verb.validate(5));
});

test("a record signature compiles field by field", () => {
  defineImplementation(
    "with-record",
    { verbs: { sum: { root: HTMLElement, select: "string" } } },
    (_el) => ({ sum: (_e, args) => void args }),
  );
  const verb = getImplementationDef("with-record")?.verbs["sum"];
  assert.ok(verb !== undefined);
  assert.doesNotThrow(() => verb.validate({ root: document.createElement("div"), select: ".amount" }));
  assert.throws(() => verb.validate({ root: document.createElement("div") }));
});

test("defineImplementation ensures the host for every declared tag", () => {
  defineImplementation(
    "hosted",
    { tags: ["input", "textarea"], config: { step: "number | undefined" }, verbs: { set: "string" } },
    (_el) => ({ set: () => undefined }),
  );
  assert.ok(customElements.get("interactable-input") !== undefined);
  assert.ok(customElements.get("interactable-textarea") !== undefined);
});

test("defineInteractableHost is idempotent per tag", () => {
  const before = customElements.get("interactable-input");
  defineInteractableHost("input");
  assert.strictEqual(customElements.get("interactable-input"), before);
});