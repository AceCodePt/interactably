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
  await import("@behaviors/formattable/formattable.ts");
  await import("@behaviors/modifiable/modifiable.ts");
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

function formatted(attributes: Record<string, string>, text: string): HTMLOutputElement {
  const el = hostElement("output", { implements: "modifiable formattable", ...attributes }) as HTMLOutputElement;
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

const CURRENCY = "{ style: 'currency', currency: 'USD' }";

test("formattable refuses an editable tag through the registry's tag check", async (t) => {
  const error = t.mock.method(console, "error");
  const input = hostElement("input", { implements: "formattable", "formattable-format": CURRENCY });
  document.body.appendChild(input);
  await flush();

  const logged = error.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(
    logged.some((message) => message.includes("formattable attaches to") && message.includes("skipped on input")),
    `expected a tag-rejection log, got: ${logged.join(" | ")}`,
  );
});

test("connect reads the current text, stores it and renders the formatted output", async () => {
  const total = formatted({ "formattable-format": CURRENCY }, "42");
  await flush();

  assert.equal(total.textContent, "$42.00");
  assert.equal(total.getAttribute("formattable-value"), "42");
});

test("a library write through modifiable formats and stores the raw text without dispatching input", async () => {
  const total = formatted({ "formattable-format": CURRENCY }, "42");
  await flush();

  let inputs = 0;
  total.addEventListener("input", () => inputs++);

  interact(total, "set", 7);
  assert.equal(total.textContent, "$7.00");
  assert.equal(total.getAttribute("formattable-value"), "7");
  assert.equal(inputs, 0);
});

test("sum('#total') and a bare #total.value reference both read the raw value", async () => {
  const total = formatted({ id: "total", "formattable-format": CURRENCY }, "7");
  const sumOut = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(sum('#total'))",
  }) as HTMLOutputElement;
  const refOut = hostElement("output", {
    implements: "modifiable",
    "on-load": "this.set(#total.value)",
  }) as HTMLOutputElement;
  document.body.append(sumOut, refOut);
  await flush();

  assert.equal(total.textContent, "$7.00");
  assert.equal(sumOut.textContent, "7");
  assert.equal(refOut.textContent, "7");
});

test("type: 'date' renders through Intl and an invalid date passes through", async () => {
  const joined = formatted({ "formattable-format": "{ type: 'date', dateStyle: 'medium' }" }, "2024-01-02");
  const invalid = formatted({ "formattable-format": "{ type: 'date', dateStyle: 'medium' }" }, "not-a-date");
  await flush();

  assert.equal(joined.textContent, "Jan 2, 2024");
  assert.equal(joined.getAttribute("formattable-value"), "2024-01-02");
  assert.equal(invalid.textContent, "not-a-date");
  assert.equal(invalid.getAttribute("formattable-value"), "not-a-date");
});

test("invalid text passes through unchanged and formattable-value stays equal to it", async () => {
  const total = formatted({ "formattable-format": CURRENCY }, "banana");
  await flush();

  assert.equal(total.textContent, "banana");
  assert.equal(total.getAttribute("formattable-value"), "banana");

  interact(total, "set", "nope");
  assert.equal(total.textContent, "nope");
  assert.equal(total.getAttribute("formattable-value"), "nope");
});

test("formattable creates no MutationObserver of its own", async () => {
  const Original = dom.window.MutationObserver;
  let created = 0;
  const Spy = class extends Original {
    constructor(callback: MutationCallback) {
      super(callback);
      created++;
    }
  };
  dom.window.MutationObserver = Spy;
  try {
    const el = hostElement("output", {
      implements: "formattable",
      "formattable-format": CURRENCY,
    }) as HTMLOutputElement;
    el.textContent = "42";
    document.body.appendChild(el);
    await flush();
    assert.equal(created, 1, "only the host's attribute observer is created");
  } finally {
    dom.window.MutationObserver = Original;
  }
});