import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { optionalCtor } from "@interactable/signature.ts";
import { getImplementationDef } from "@behaviors/implementation-registry.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

test("registers a tags-bearing definition even when the observed-attribute union is empty", () => {
  const def = defineImplementation("empty-union", { tags: ["section"], verbs: { go: "undefined" } }, () => ({
    go: () => undefined,
  }));
  assert.equal(def.name, "empty-union");
  assert.equal(getImplementationDef("empty-union")?.name, "empty-union");
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

test("a record signature with a '*' rest key validates undeclared keys at runtime", () => {
  defineImplementation(
    "with-rest",
    { verbs: { render: { root: HTMLElement, "*": "string | number | boolean" } } },
    (_el) => ({ render: (_e, args) => void args }),
  );
  const verb = getImplementationDef("with-rest")?.verbs["render"];
  assert.ok(verb !== undefined);
  const value = verb.validate({ root: document.createElement("div"), title: "x", n: 3 }) as Record<
    string,
    unknown
  >;
  assert.equal(value["title"], "x");
  assert.equal(value["n"], 3);
  assert.throws(() => verb.validate({ root: document.createElement("div"), title: { a: 1 } }));
});

test("an optional-Ctor field may be omitted from a record argument but is instance-checked when present", () => {
  defineImplementation(
    "with-optional-ctor",
    { verbs: { render: { template: optionalCtor(HTMLTemplateElement), "*": "string" } } },
    (_el) => ({ render: (_e, args) => void args }),
  );
  const verb = getImplementationDef("with-optional-ctor")?.verbs["render"];
  assert.ok(verb !== undefined);
  assert.doesNotThrow(() => verb.validate({ title: "x" }));
  assert.doesNotThrow(() =>
    verb.validate({ template: document.createElement("template"), title: "x" }),
  );
  assert.throws(() => verb.validate({ template: document.createElement("div"), title: "x" }));
});