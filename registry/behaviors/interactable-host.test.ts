import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let defineImplementation: typeof import("@behaviors/_implementation-definition.ts").defineImplementation;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;
let InteractionEvent: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let NotReadyError: typeof import("@behaviors/implementation-utils.ts").NotReadyError;
const calls: string[] = [];

before(async () => {
  dom = setupJsdom();
  ({ defineImplementation } = await import("@behaviors/_implementation-definition.ts"));
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  ({ InteractionEvent } = await import("@interactable/interaction-event.ts"));
  ({ NotReadyError } = await import("@behaviors/implementation-utils.ts"));

  defineImplementation(
    "stateful",
    {
      tags: ["div"],
      state: { open: "boolean | undefined" },
      verbs: { toggle: "undefined", peek: "undefined" },
    },
    (_el, attrs) => ({
      toggle: () => {
        attrs.open = attrs.open ? undefined : true;
      },
      peek: () => attrs.open,
      connectedCallback: () => {
        calls.push("stateful.connected");
      },
      disconnectedCallback: () => {
        calls.push("stateful.disconnected");
      },
      attributeChangedCallback: (name: string) => {
        calls.push(`stateful.attr:${name}`);
      },
    }),
  );

  defineImplementation(
    "alpha",
    {
      tags: ["div"],
      config: { level: "number | undefined" },
      verbs: {
        go: "undefined",
        echo: "string",
        boom: "undefined",
        add: "number",
        reportLevel: "undefined",
        asyncVerb: "undefined",
        shared: "undefined",
      },
    },
    (_el, attrs) => ({
      go: () => {
        calls.push("alpha.go");
      },
      echo: (_e, value) => value,
      boom: () => {
        throw new Error("kaboom");
      },
      add: (_e, n) => n * 2,
      reportLevel: () => attrs.level,
      asyncVerb: () => Promise.resolve(1),
      shared: () => {
        calls.push("alpha.shared");
      },
      onInput: () => {
        calls.push("alpha.oninput");
      },
    }),
  );

  defineImplementation(
    "beta",
    {
      tags: ["div"],
      verbs: { stop: "undefined", shared: "undefined" },
      config: { marker: "string | undefined" },
    },
    (_el) => ({
      stop: () => {
        calls.push("beta.stop");
      },
      shared: () => {
        calls.push("beta.shared");
      },
    }),
  );

  defineImplementation(
    "inputonly",
    {
      tags: ["input"],
      verbs: { focusIt: "undefined" },
      config: { hint: "string | undefined" },
    },
    (_el) => ({ focusIt: () => undefined }),
  );

  defineImplementation("prevent-default", { verbs: {} }, () => ({}));

  defineInteractableHost("button");
  defineInteractableHost("form");
  defineInteractableHost("section");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  calls.length = 0;
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function dispatchInteraction(
  el: Element,
  verb: string,
  arg: unknown = undefined,
): InstanceType<typeof InteractionEvent> {
  const event = new InteractionEvent({ verb, arg, source: el, originalEvent: new Event("interaction") });
  el.dispatchEvent(event);
  return event;
}

test("a trigger binds one passive listener per on-* attribute and routes to the receiver", async (t) => {
  const trigger = hostElement("button", { "on-click": "#recv.go()" });
  const receiver = hostElement("div", { id: "recv", implements: "alpha" });
  document.body.append(trigger, receiver);
  await flush();

  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, ["alpha.go"]);
  assert.equal(t.mock.method(console, "warn").mock.callCount(), 0);
});

test("the on-* value is read at fire time, so edits take effect without an observer", async () => {
  const trigger = hostElement("button", { "on-click": "#recv.go()" });
  const receiver = hostElement("div", { id: "recv2", implements: "alpha" });
  document.body.append(trigger, receiver);
  await flush();

  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  trigger.setAttribute("on-click", "#recv2.echo('edited')");
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, ["alpha.go"]);
});

test("listeners are cleaned up on disconnect and re-bound on reconnect", async () => {
  const trigger = hostElement("button", { "on-click": "#recv.go()" });
  const receiver = hostElement("div", { id: "recv3", implements: "alpha" });
  document.body.append(trigger, receiver);
  await flush();
  calls.length = 0;

  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, ["alpha.go"]);

  trigger.remove();
  calls.length = 0;
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, []);

  document.body.appendChild(trigger);
  await flush();
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, ["alpha.go"]);
});

test("an on-<type> the element has no event for warns once, including custom events", (t) => {
  const warn = t.mock.method(console, "warn");
  const trigger = hostElement("button", { "on-clcik": "#recv.go()" });
  document.body.appendChild(trigger);
  assert.ok(warn.mock.callCount() >= 1);
  assert.ok(String(warn.mock.calls[0]!.arguments[0]).includes('no "clcik" event'));

  const custom = hostElement("button", { "on-cart-updated": "#recv.go()" });
  document.body.appendChild(custom);
  assert.ok(String(warn.mock.calls[1]!.arguments[0]).includes('no "cart-updated" event'));
});

test("a native action that will also run warns at connect", (t) => {
  const warn = t.mock.method(console, "warn");
  const form = hostElement("form", { "on-submit": "#recv.go()" });
  document.body.appendChild(form);
  assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("also submits natively")));
});

test("prevent-default silences the native-action warning", (t) => {
  const warn = t.mock.method(console, "warn");
  const form = hostElement("form", {
    "on-submit": "#recv.go()",
    implements: "prevent-default",
  });
  document.body.appendChild(form);
  assert.ok(
    !warn.mock.calls.some((call) => String(call.arguments[0]).includes("also submits natively")),
  );
});

test("implements routing picks the first implementation in order that declares the verb", async () => {
  const receiver = hostElement("div", { id: "route", implements: "alpha beta" });
  document.body.appendChild(receiver);
  await flush();

  dispatchInteraction(receiver, "shared");
  assert.deepEqual(calls, ["alpha.shared"]);
  dispatchInteraction(receiver, "go");
  assert.deepEqual(calls, ["alpha.shared", "alpha.go"]);
  dispatchInteraction(receiver, "stop");
  assert.deepEqual(calls, ["alpha.shared", "alpha.go", "beta.stop"]);
});

test("implements order decides shared verbs", async () => {
  const receiver = hostElement("div", { id: "route2", implements: "beta alpha" });
  document.body.appendChild(receiver);
  await flush();

  dispatchInteraction(receiver, "shared");
  assert.deepEqual(calls, ["beta.shared"]);
});

test("a verb no implementation owns leaves handled false for the executor to report", async (t) => {
  const error = t.mock.method(console, "error");
  const trigger = hostElement("button", { "on-click": "#recv4.nope()" });
  const receiver = hostElement("div", { id: "recv4", implements: "alpha" });
  document.body.append(trigger, receiver);
  await flush();

  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.ok(error.mock.calls.some((call) => String(call.arguments[0]).includes("no implementation")));
});

test("a tag mismatch is reported and that implements name is skipped", async (t) => {
  const error = t.mock.method(console, "error");
  const receiver = hostElement("div", { id: "mismatch", implements: "inputonly" });
  document.body.appendChild(receiver);
  await flush();

  assert.ok(
    error.mock.calls.some((call) =>
      String(call.arguments[0]).includes("inputonly attaches to <input>; skipped on div#mismatch"),
    ),
  );
  const event = dispatchInteraction(receiver, "focusIt");
  assert.equal(event.handled, false);
});

test("an interaction before didEnsure is reported as NotReadyError, never queued", async () => {
  const receiver = hostElement("div", { id: "late", implements: "alpha" });
  document.body.appendChild(receiver);

  const early = dispatchInteraction(receiver, "go");
  assert.equal(early.handled, true);
  assert.ok(early.error instanceof NotReadyError);
  assert.deepEqual(calls, []);

  await flush();
  const later = dispatchInteraction(receiver, "go");
  assert.equal(later.handled, true);
  assert.equal(later.error, undefined);
  assert.deepEqual(calls, ["alpha.go"]);
});

test("handled, result and error channels", async () => {
  const receiver = hostElement("div", { id: "chan", implements: "alpha" });
  document.body.appendChild(receiver);
  await flush();

  const valid = dispatchInteraction(receiver, "echo", "hi");
  assert.equal(valid.handled, true);
  assert.equal(valid.result, "hi");
  assert.equal(valid.error, undefined);

  const badArg = dispatchInteraction(receiver, "echo", 42);
  assert.equal(badArg.handled, true);
  assert.ok(badArg.error instanceof Error);

  const thrown = dispatchInteraction(receiver, "boom");
  assert.equal(thrown.handled, true);
  assert.ok(thrown.error instanceof Error);
  assert.match(String(thrown.error), /kaboom/);

  const computed = dispatchInteraction(receiver, "add", 5);
  assert.equal(computed.result, 10);
});

test("a verb that returns a promise warns that chains are synchronous", async (t) => {
  const warn = t.mock.method(console, "warn");
  const receiver = hostElement("div", { id: "promise", implements: "alpha" });
  document.body.appendChild(receiver);
  await flush();

  const event = dispatchInteraction(receiver, "asyncVerb");
  assert.equal(event.handled, true);
  assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("returned a promise")));
});

test("config attributes reach the implementation through attrs, typed", async () => {
  const receiver = hostElement("div", { id: "lvl", implements: "alpha", "alpha-level": "2" });
  document.body.appendChild(receiver);
  await flush();

  const event = dispatchInteraction(receiver, "reportLevel");
  assert.equal(event.result, 2);
});

test("implementation on* methods are wired as listeners on the element", async () => {
  const receiver = hostElement("div", { id: "onstar", implements: "alpha" });
  document.body.appendChild(receiver);
  await flush();

  receiver.dispatchEvent(new Event("input"));
  assert.deepEqual(calls, ["alpha.oninput"]);
});

test("lifecycle callbacks are forwarded and state writes render through attributeChangedCallback", async () => {
  const receiver = hostElement("div", { id: "stateful", implements: "stateful" });
  document.body.appendChild(receiver);
  await flush();

  assert.ok(calls.includes("stateful.connected"));

  calls.length = 0;
  let event = dispatchInteraction(receiver, "toggle");
  assert.equal(event.handled, true);
  assert.equal(receiver.getAttribute("data-open"), "true");
  assert.deepEqual(calls, ["stateful.attr:data-open"]);

  event = dispatchInteraction(receiver, "peek");
  assert.equal(event.result, true);

  calls.length = 0;
  dispatchInteraction(receiver, "toggle");
  assert.equal(receiver.hasAttribute("data-open"), false);

  receiver.remove();
  assert.ok(calls.includes("stateful.disconnected"));
});