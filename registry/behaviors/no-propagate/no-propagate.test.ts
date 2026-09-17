import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/no-propagate/no-propagate.ts");
  ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
});

test("no-propagate stops a click from reaching the parent by default", async () => {
  const parent = document.createElement("div");
  let parentClicks = 0;
  parent.addEventListener("click", () => {
    parentClicks++;
  });
  const child = hostElement("button", { implements: "no-propagate" });
  parent.appendChild(child);
  document.body.append(parent);
  await flush();

  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(parentClicks, 0);

  parent.remove();
  document.body.appendChild(parent);
  await flush();
  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(parentClicks, 0);
});

test("no-propagate-events configures the list, including event:key entries", async () => {
  const parent = document.createElement("div");
  let clicks = 0;
  let enters = 0;
  let otherKeys = 0;
  parent.addEventListener("click", () => {
    clicks++;
  });
  parent.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") enters++;
    else otherKeys++;
  });
  const child = hostElement("button", {
    implements: "no-propagate",
    "no-propagate-events": "click, keydown:enter",
  });
  parent.appendChild(child);
  document.body.append(parent);
  await flush();

  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  child.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  child.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  assert.deepEqual([clicks, enters, otherKeys], [0, 0, 1]);
});

test("the event list is re-read when no-propagate-events changes", async () => {
  const parent = document.createElement("div");
  let clicks = 0;
  parent.addEventListener("click", () => {
    clicks++;
  });
  const child = hostElement("button", { implements: "no-propagate" });
  parent.appendChild(child);
  document.body.append(parent);
  await flush();

  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(clicks, 0);

  child.setAttribute("no-propagate-events", "");
  await flush();
  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(clicks, 1);

  child.setAttribute("no-propagate-events", "click");
  await flush();
  child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(clicks, 1);
});

test("no-propagate also stops events bubbling up from a descendant", async () => {
  const parent = document.createElement("div");
  let clicks = 0;
  parent.addEventListener("click", () => {
    clicks++;
  });
  const child = hostElement("div", { implements: "no-propagate" });
  const descendant = document.createElement("button");
  child.appendChild(descendant);
  parent.appendChild(child);
  document.body.append(parent);
  await flush();

  descendant.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(clicks, 0);
});