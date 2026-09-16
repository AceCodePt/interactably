import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/no-propagate/no-propagate.ts");
  await import("@behaviors/dirtyable/dirtyable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
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

test("is-dirty toggles as the value diverges from the connect-time baseline and back", async () => {
  const input = hostElement("input", { implements: "dirtyable", value: "a" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  assert.equal(input.classList.contains("is-dirty"), false);

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), true);

  input.value = "a";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), false);
});

test("no attributes are written", async () => {
  const input = hostElement("input", { implements: "dirtyable", value: "a" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), true);
  assert.equal(input.hasAttribute("data-dirty"), false);
  assert.equal(input.getAttribute("dirty-state"), null);
});

test("markClean moves the baseline up to the current value", async () => {
  const input = hostElement("input", { implements: "dirtyable", value: "a" }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  input.value = "b";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), true);

  interact(input, "markClean");
  assert.equal(input.classList.contains("is-dirty"), false);

  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), false);

  input.value = "c";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(input.classList.contains("is-dirty"), true);
});

test("the baseline is the SSR'd value attribute, not the empty default", async () => {
  const textarea = hostElement("textarea", { implements: "dirtyable" }) as HTMLTextAreaElement;
  textarea.textContent = "server content";
  document.body.appendChild(textarea);
  await flush();

  assert.equal(textarea.classList.contains("is-dirty"), false);

  textarea.value = "edited";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(textarea.classList.contains("is-dirty"), true);
});

test("a library write through modifiable dirties via the interaction event; reset clears it", async () => {
  const input = hostElement("input", {
    implements: "modifiable dirtyable",
    value: "1",
  }) as HTMLInputElement;
  document.body.appendChild(input);
  await flush();

  assert.equal(input.classList.contains("is-dirty"), false);

  interact(input, "inc");
  assert.equal(input.value, "2");
  assert.equal(input.classList.contains("is-dirty"), true);

  interact(input, "reset");
  assert.equal(input.value, "1");
  assert.equal(input.classList.contains("is-dirty"), false);
});