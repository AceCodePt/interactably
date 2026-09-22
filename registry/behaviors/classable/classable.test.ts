import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/classable/classable.ts");
  await import("@behaviors/revealable/revealable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
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

test("add adds a class once, natively", async () => {
  const el = hostElement("div", { implements: "classable" });
  document.body.appendChild(el);
  await flush();

  interact(el, "add", "open");
  assert.equal(el.classList.contains("open"), true);

  interact(el, "add", "open");
  assert.equal(el.className, "open");
});

test("add leaves existing class names untouched", async () => {
  const el = hostElement("div", { implements: "classable", class: "a b" });
  document.body.appendChild(el);
  await flush();

  interact(el, "add", "open");
  assert.equal(el.className, "a b open");
});

test("remove drops one class; a missing class is a no-op", async () => {
  const el = hostElement("div", { implements: "classable", class: "a b c" });
  document.body.appendChild(el);
  await flush();

  interact(el, "remove", "b");
  assert.equal(el.className, "a c");

  const event = interact(el, "remove", "zzz");
  assert.equal(event.error, undefined);
  assert.equal(el.className, "a c");
});

test("toggle flips the class on and back off", async () => {
  const el = hostElement("div", { implements: "classable" });
  document.body.appendChild(el);
  await flush();

  interact(el, "toggle", "open");
  assert.equal(el.classList.contains("open"), true);

  interact(el, "toggle", "open");
  assert.equal(el.classList.contains("open"), false);
});

test("a whitespace token is not split: the browser throws InvalidCharacterError", async () => {
  const el = hostElement("div", { implements: "classable" });
  document.body.appendChild(el);
  await flush();

  const addEvent = interact(el, "add", "open active");
  assert.equal((addEvent.error as DOMException).name, "InvalidCharacterError");
  assert.equal(el.className, "");

  const toggleEvent = interact(el, "toggle", "open active");
  assert.equal((toggleEvent.error as DOMException).name, "InvalidCharacterError");
  assert.equal(el.className, "");
});

test("the empty string throws SyntaxError", async () => {
  const el = hostElement("div", { implements: "classable" });
  document.body.appendChild(el);
  await flush();

  const event = interact(el, "add", "");
  assert.equal((event.error as DOMException).name, "SyntaxError");
  assert.equal(el.className, "");
});

test("a non-string argument is a signature error", async () => {
  const el = hostElement("div", { implements: "classable" });
  document.body.appendChild(el);
  await flush();

  const event = interact(el, "add", 42);
  assert.ok(event.error instanceof Error);
  assert.equal(el.className, "");
});

test("executor path through attach(): #menu.toggle('open') from a button, then add/remove", async () => {
  const button = hostElement("button", {
    id: "menu-btn",
    implements: "classable",
    "on-click": "#menu.toggle('open')",
  });
  const menu = hostElement("nav", { id: "menu", implements: "classable" });
  document.body.append(button, menu);
  await flush();

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(menu.classList.contains("open"), true);

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(menu.classList.contains("open"), false);

  button.setAttribute("on-click", "#menu.add('open') && #menu.remove('closed')");
  menu.className = "closed";
  await flush();

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(menu.className, "open");
});

test("first-match in implements order decides toggle, not the argument shape", async () => {
  const revealableFirst = hostElement("div", { implements: "revealable classable" });
  document.body.appendChild(revealableFirst);
  await flush();

  const noArgRevealable = interact(revealableFirst, "toggle");
  assert.equal(noArgRevealable.error, undefined);
  assert.equal(
    revealableFirst.getAttribute("revealable-open"),
    "true",
    "revealable handled toggle(), not classable",
  );

  const classableFirst = hostElement("div", { implements: "classable revealable" });
  document.body.appendChild(classableFirst);
  await flush();

  const noArgClassable = interact(classableFirst, "toggle");
  assert.ok(noArgClassable.error instanceof Error, "classable's toggle needs a string");

  const withArg = interact(revealableFirst, "toggle", "x");
  assert.ok(withArg.error instanceof Error, "revealable's toggle declares undefined, not a string");
});