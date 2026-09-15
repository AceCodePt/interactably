import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/hashable/hashable.ts");
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("section");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", window.location.pathname);
});

function section(id: string): HTMLElement {
  const el = document.createElement("section", { is: "interactable-section" });
  el.setAttribute("implements", "hashable");
  el.id = id;
  document.body.appendChild(el);
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

test("hash writes the element's id into the location hash without a history entry", async () => {
  const el = section("intro");
  await flush();
  const length = window.history.length;

  interact(el, "hash");

  assert.equal(window.location.hash, "#intro");
  assert.equal(window.history.length, length, "replaceState adds no history entry");
});

test("calling hash again when the hash already matches is a no-op", async () => {
  const el = section("intro");
  await flush();

  interact(el, "hash");
  assert.equal(window.location.hash, "#intro");
  const length = window.history.length;

  interact(el, "hash");

  assert.equal(window.location.hash, "#intro");
  assert.equal(window.history.length, length, "no history entry is added for a matching hash");
});

test("an element without an id warns once and leaves the hash alone", async (t) => {
  const warn = t.mock.method(console, "warn");
  const el = section("");
  await flush();

  interact(el, "hash");
  interact(el, "hash");

  assert.equal(warn.mock.callCount(), 1, "warns once, not per call");
  assert.equal(window.location.hash, "", "the hash is untouched");
});

test("hash writes the id of each element, replacing the previous hash", async () => {
  const intro = section("intro");
  const outro = section("outro");
  await flush();

  interact(intro, "hash");
  assert.equal(window.location.hash, "#intro");

  interact(outro, "hash");
  assert.equal(window.location.hash, "#outro");
});