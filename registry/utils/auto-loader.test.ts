import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../tests/jsdom.ts";

let dom: JSDOM;
let dispose: (() => void) | undefined;
let infoCount = 0;
let defineImplementation: typeof import("../behaviors/_implementation-definition.ts").defineImplementation;
let installAutoLoader: typeof import("./auto-loader.ts").installAutoLoader;

before(async () => {
  dom = setupJsdom(
    "<!doctype html><html><body>" +
      '<button id="b" on-click="#r.go()">Open</button>' +
      '<div id="r" implements="demo"></div>' +
      "</body></html>",
  );
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("auto-loader")) infoCount++;
    originalInfo(...args);
  };
  ({ defineImplementation } = await import("../behaviors/_implementation-definition.ts"));
  ({ installAutoLoader } = await import("./auto-loader.ts"));
  defineImplementation(
    "demo",
    { tags: ["div"], config: { flag: "boolean | undefined" }, verbs: { go: "undefined" } },
    (_el) => ({ go: () => undefined }),
  );
  dispose = installAutoLoader();
});

after(() => {
  dispose?.();
  teardownJsdom(dom);
});

test("adds is=interactable-<tag> to elements with implements or on-*, by node replacement", async () => {
  const button = document.getElementById("b") as HTMLElement;
  const receiver = document.getElementById("r") as HTMLElement;
  assert.equal(button.getAttribute("is"), "interactable-button");
  assert.equal(receiver.getAttribute("is"), "interactable-div");

  await flush();
  let handled = false;
  receiver.addEventListener("interaction", (raw) => {
    handled = true;
    (raw as unknown as { handled: boolean }).handled = true;
  });
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(handled, true);
});

test("dynamically inserted elements are upgraded one microtask after insertion", async () => {
  const added = document.createElement("button");
  added.id = "added";
  added.setAttribute("on-click", "#r.go()");
  document.body.appendChild(added);
  assert.equal(added.getAttribute("is"), null);
  await flush();
  const upgraded = document.getElementById("added") as HTMLElement;
  assert.notStrictEqual(upgraded, added);
  assert.equal(upgraded.getAttribute("is"), "interactable-button");
});

test("logs a single console.info per page when it upgrades anything", async () => {
  const a = document.createElement("button");
  a.setAttribute("on-click", "#r.go()");
  document.body.appendChild(a);
  const b = document.createElement("div");
  b.setAttribute("implements", "demo");
  document.body.appendChild(b);
  await flush();
  assert.equal(infoCount, 1);
});

test("does not touch elements that already carry is=", async () => {
  const el = document.createElement("button");
  el.setAttribute("is", "interactable-button");
  el.setAttribute("on-click", "#r.go()");
  document.body.appendChild(el);
  await flush();
  assert.equal(el.getAttribute("is"), "interactable-button");
  assert.strictEqual(el.isConnected, true);
});