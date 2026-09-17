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
  await import("@behaviors/logger/logger.ts");
  await import("@behaviors/no-propagate/no-propagate.ts");
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

function interact(el: Element, verb: string, arg?: unknown, source?: Element): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: source ?? el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("log accepts string, number, boolean and undefined and names the receiver and source", async (t) => {
  const spy = t.mock.method(console, "log");
  const receiver = hostElement("div", { implements: "logger", id: "log" });
  const trigger = hostElement("button", { id: "save" });
  document.body.append(receiver, trigger);
  await flush();
  const event = new InteractionEventClass({
    verb: "log",
    arg: "hello",
    source: trigger,
    originalEvent: new Event("click"),
  });
  receiver.dispatchEvent(event);
  assert.equal(event.handled, true);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("div#log"));
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("button#save"));
  assert.equal(spy.mock.calls[0]!.arguments[1], "hello");
});

test("log handles the other argument kinds", async (t) => {
  const spy = t.mock.method(console, "log");
  const receiver = hostElement("div", { implements: "logger" });
  document.body.appendChild(receiver);
  await flush();

  interact(receiver, "log", 5);
  interact(receiver, "log", true);
  interact(receiver, "log", undefined);
  assert.equal(spy.mock.callCount(), 3);
  assert.equal(spy.mock.calls[0]!.arguments[1], 5);
  assert.equal(spy.mock.calls[1]!.arguments[1], true);
  assert.equal(spy.mock.calls[2]!.arguments[1], undefined);
});

test("has no trigger config: the source is context on the event", async (t) => {
  const spy = t.mock.method(console, "log");
  const receiver = hostElement("div", { implements: "logger" });
  const trigger = hostElement("button", { on: "nope" });
  document.body.append(receiver, trigger);
  await flush();

  interact(receiver, "log", "from-the-trigger", trigger);
  assert.equal(spy.mock.callCount(), 1);
  assert.equal(spy.mock.calls[0]!.arguments[1], "from-the-trigger");
});