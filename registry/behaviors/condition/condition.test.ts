import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/revealable/revealable.ts");
  await import("@behaviors/condition/condition.ts");
  const host = await import("@behaviors/interactable-host.ts");
  host.defineInteractableHost("div");
  host.defineInteractableHost("input");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function revealTarget(id: string): HTMLDivElement {
  const el = document.createElement("div", { is: "interactable-div" }) as HTMLDivElement;
  el.id = id;
  el.setAttribute("implements", "revealable");
  return el;
}

function conditionElement(attributes: Record<string, string>): HTMLDivElement {
  const el = document.createElement("div", { is: "interactable-div" }) as HTMLDivElement;
  el.setAttribute("implements", "condition");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

test("condition fires its verb when the watched attribute matches", async () => {
  const watched = document.createElement("div");
  watched.id = "source";
  watched.setAttribute("data-count", "0");
  const target = revealTarget("target");
  const el = conditionElement({
    "condition-watch": "source",
    "condition-on": "data-count",
    "condition-op": ">",
    "condition-value": "5",
    "condition-verb": "show",
    "condition-target": "target",
  });
  document.body.append(watched, target, el);
  await flush();

  assert.equal(target.hasAttribute("data-open"), false);
  watched.setAttribute("data-count", "10");
  await flush();
  assert.equal(target.hasAttribute("data-open"), true);
});

test("condition compares strings with ==", async () => {
  const watched = document.createElement("div");
  watched.id = "source";
  watched.setAttribute("data-status", "inactive");
  const target = revealTarget("target");
  const el = conditionElement({
    "condition-watch": "source",
    "condition-on": "data-status",
    "condition-op": "==",
    "condition-value": "active",
    "condition-verb": "show",
    "condition-target": "target",
  });
  document.body.append(watched, target, el);
  await flush();

  watched.setAttribute("data-status", "active");
  await flush();
  assert.equal(target.hasAttribute("data-open"), true);
});

test("condition watches a form control's value property", async () => {
  const watched = document.createElement("input");
  watched.id = "agree";
  watched.value = "no";
  const target = revealTarget("target");
  const el = conditionElement({
    "condition-watch": "agree",
    "condition-on": "value",
    "condition-op": "==",
    "condition-value": "yes",
    "condition-verb": "show",
    "condition-target": "target",
  });
  document.body.append(watched, target, el);
  await flush();

  watched.value = "yes";
  watched.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(target.hasAttribute("data-open"), true);
});

test("condition stays silent when the comparison fails", async () => {
  const watched = document.createElement("div");
  watched.id = "source";
  watched.setAttribute("data-count", "3");
  const target = revealTarget("target");
  const el = conditionElement({
    "condition-watch": "source",
    "condition-on": "data-count",
    "condition-op": ">",
    "condition-value": "5",
    "condition-verb": "show",
    "condition-target": "target",
  });
  document.body.append(watched, target, el);
  await flush();

  watched.setAttribute("data-count", "4");
  await flush();
  assert.equal(target.hasAttribute("data-open"), false);
});