import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { describeElement } from "@interactable/describe-element.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
  defineImplementation("describe-fake", { verbs: {} }, () => ({}));
});

after(() => {
  teardownJsdom(dom);
});

test("describeElement reports the presence attributes in attribute order", () => {
  const el = document.createElement("div");
  el.id = "d";
  el.setAttribute("describe-fake", "");
  el.setAttribute("hidden", "");
  assert.equal(describeElement(el), "<div#d describe-fake>");
});

test("describeElement ignores unknown bare attributes and the removed implements form", () => {
  const el = document.createElement("section");
  el.setAttribute("ghost", "");
  el.setAttribute("implements", "describe-fake");
  assert.equal(describeElement(el), "<section>");
});

test("describeElement reports an element with no implementation attributes plainly", () => {
  const el = document.createElement("span");
  el.id = "plain";
  assert.equal(describeElement(el), "<span#plain>");
});
