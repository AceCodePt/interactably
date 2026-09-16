import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { bindAttributes } from "@interactable/attributes.ts";
import type { AttributeBindings } from "@interactable/attributes.ts";
import { compileSignature } from "@interactable/signature.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
});

after(() => {
  teardownJsdom(dom);
});

function def(
  config: Record<string, string>,
  state: Record<string, string>,
): AttributeBindings {
  const slot = (raw: string) => ({ raw, sig: compileSignature(raw) });
  return {
    config: Object.fromEntries(Object.entries(config).map(([k, raw]) => [k, slot(raw)])),
    state: Object.fromEntries(Object.entries(state).map(([k, raw]) => [k, slot(raw)])),
  };
}

type WithOpen = { open?: boolean | undefined };
type WithStep = { step?: number };
type WithCount = { count?: number };
type WithMode = { mode?: "upper" | "lower" };
type WithValue = { value?: string | number };
type WithAuto = { mode?: number | "auto" };

test("config keys are read-only getters over <name>-<key>, validated to the slot type", () => {
  const el = document.createElement("div");
  el.setAttribute("demo-step", "2");
  const attrs = bindAttributes(el, "demo", def({ step: "number | undefined" }, {})) as WithStep;
  assert.equal(attrs.step, 2);
  assert.throws(() => {
    (attrs as { step?: number }).step = 3;
  });
});

test("an absent config attribute reads undefined, not a string", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({ step: "number | undefined" }, {})) as WithStep;
  assert.equal(attrs.step, undefined);
});

test("state keys get and set over data-<key>, and undefined removes the attribute", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({}, { open: "boolean | undefined" })) as WithOpen;
  attrs.open = true;
  assert.equal(el.getAttribute("data-open"), "true");
  assert.equal(attrs.open, true);
  attrs.open = undefined;
  assert.equal(el.hasAttribute("data-open"), false);
  assert.equal(attrs.open, undefined);
});

test("a config write throws on the proxy", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({ step: "number | undefined" }, {})) as WithStep;
  assert.throws(() => {
    attrs.step = 2;
  }, /read-only/);
});

test("a state write validates the value through the compiled slot", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({}, { open: "boolean | undefined" })) as WithOpen;
  assert.throws(() => {
    (attrs as unknown as { open?: string }).open = "maybe";
  });
  assert.equal(el.hasAttribute("data-open"), false);
});

test("an invalid attribute value fails validation on read", () => {
  const el = document.createElement("div");
  el.setAttribute("demo-step", "banana");
  const attrs = bindAttributes(el, "demo", def({ step: "number" }, {})) as WithStep;
  assert.throws(() => {
    void attrs.step;
  });
});

test("string attributes read through unchanged", () => {
  const el = document.createElement("div");
  el.setAttribute("demo-mode", "upper");
  const attrs = bindAttributes(el, "demo", def({ mode: "'upper' | 'lower'" }, {})) as WithMode;
  assert.equal(attrs.mode, "upper");
});

test("a number|string slot keeps the text when it does not parse to a number", () => {
  const el = document.createElement("div");
  el.setAttribute("demo-value", "abc");
  const attrs = bindAttributes(el, "demo", def({ value: "number | string" }, {})) as WithValue;
  assert.equal(attrs.value, "abc");
  el.setAttribute("demo-value", "3");
  assert.equal(attrs.value, 3);
});

test("a number|literal slot accepts the literal and numeric text", () => {
  const el = document.createElement("div");
  el.setAttribute("demo-mode", "auto");
  const attrs = bindAttributes(el, "demo", def({ mode: "number | 'auto'" }, {})) as WithAuto;
  assert.equal(attrs.mode, "auto");
  el.setAttribute("demo-mode", "3");
  assert.equal(attrs.mode, 3);
});

test("boolean slots read presence as true and 'false' as false", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({}, { open: "boolean | undefined" })) as WithOpen;
  assert.equal(attrs.open, undefined);
  el.setAttribute("data-open", "");
  assert.equal(attrs.open, true);
  el.setAttribute("data-open", "true");
  assert.equal(attrs.open, true);
  el.setAttribute("data-open", "false");
  assert.equal(attrs.open, false);
});

test("an invalid value throws naming the element, attribute, and slot signature", () => {
  const el = document.createElement("div");
  el.id = "panel";
  el.setAttribute("demo-step", "banana");
  const attrs = bindAttributes(el, "demo", def({ step: "number" }, {})) as WithStep;
  assert.throws(
    () => {
      void attrs.step;
    },
    /demo-step="banana" on <div#panel>: not a valid value for "number"/,
  );
});

test("unknown keys read undefined and writes are inert", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({}, {}));
  assert.equal(attrs["unknown"], undefined);
  attrs["unknown"] = 1;
  assert.equal(el.hasAttribute("data-unknown"), false);
});

test("the data-* write reflects live reads", () => {
  const el = document.createElement("div");
  const attrs = bindAttributes(el, "demo", def({}, { count: "number | undefined" })) as WithCount;
  attrs.count = 7;
  assert.equal(attrs.count, 7);
  assert.equal(el.getAttribute("data-count"), "7");
});