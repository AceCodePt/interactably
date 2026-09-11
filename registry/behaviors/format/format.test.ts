import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../../tests/jsdom.ts";
import type { InteractionEvent } from "../../interactable/interaction-event.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("../../interactable/interaction-event.ts").InteractionEvent;

before(async () => {
  dom = setupJsdom();
  await import("../modifiable/modifiable.ts");
  await import("../summable/summable.ts");
  await import("./format.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("../../interactable/interaction-event.ts"));
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

test("format('currency') writes the formatted value and keeps data-value numeric", async () => {
  const out = hostElement("output", { implements: "format" }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();
  out.textContent = "1234.5";

  interact(out, "format", "currency");
  assert.equal(out.textContent, "$1,234.50");
  assert.equal(out.dataset["value"], "1234.5");
});

test("format('number') and format('percent')", async () => {
  const number = hostElement("output", { implements: "format" }) as HTMLOutputElement;
  const percent = hostElement("output", { implements: "format" }) as HTMLOutputElement;
  document.body.append(number, percent);
  await flush();

  number.textContent = "1234.5";
  interact(number, "format", "number");
  assert.equal(number.textContent, "1,234.5");

  percent.textContent = "25";
  interact(percent, "format", "percent");
  assert.equal(percent.textContent, "25%");
});

test("format('date') parses the value as a date", async () => {
  const out = hostElement("output", { implements: "format" }) as HTMLOutputElement;
  document.body.appendChild(out);
  await flush();
  out.textContent = "2024-01-02";

  interact(out, "format", "date");
  assert.equal(out.textContent, "Jan 2, 2024");
  assert.equal(out.dataset["value"], "2024-01-02");
});

test("config locale, currency, date-style, min/max-fraction-digits and notation drive the output", async () => {
  const german = hostElement("output", {
    implements: "format",
    "format-locale": "de-DE",
  }) as HTMLOutputElement;
  const euro = hostElement("output", {
    implements: "format",
    "format-currency": "EUR",
  }) as HTMLOutputElement;
  const digits = hostElement("output", {
    implements: "format",
    "format-min-fraction-digits": "2",
    "format-max-fraction-digits": "3",
  }) as HTMLOutputElement;
  const compact = hostElement("output", {
    implements: "format",
    "format-notation": "compact",
  }) as HTMLOutputElement;
  document.body.append(german, euro, digits, compact);
  await flush();

  german.textContent = "1234.5";
  interact(german, "format", "number");
  assert.equal(german.textContent, "1.234,5");

  euro.textContent = "1234.5";
  interact(euro, "format", "currency");
  assert.equal(euro.textContent, "€1,234.50");

  digits.textContent = "3";
  interact(digits, "format", "number");
  assert.equal(digits.textContent, "3.00");

  compact.textContent = "1500";
  interact(compact, "format", "number");
  assert.equal(compact.textContent, "1.5K");
});

test("format writes textContent on elements without a value property", async () => {
  const span = hostElement("span", { implements: "format" }) as HTMLSpanElement;
  document.body.appendChild(span);
  await flush();
  span.textContent = "42";

  interact(span, "format", "number");
  assert.equal(span.textContent, "42");
});