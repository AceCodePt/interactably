import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  resetFakeIntersectionObserver,
} from "@tests/intersection-observer.ts";

let dom: JSDOM;
let defineImplementation: typeof import("@behaviors/_implementation-definition.ts").defineImplementation;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;
let InteractionEvent: typeof import("@interactable/interaction-event.ts").InteractionEvent;
const calls: string[] = [];

before(async () => {
  dom = setupJsdom();
  installFakeIntersectionObserver();
  ({ defineImplementation } = await import("@behaviors/_implementation-definition.ts"));
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  ({ InteractionEvent } = await import("@interactable/interaction-event.ts"));

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
  resetFakeIntersectionObserver();
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

test("a keyed button on-keydown/on-keyup does not warn; an unkeyed one does", (t) => {
  const warn = t.mock.method(console, "warn");
  const keyed = hostElement("button", { "on-keydown": "escape: #recv.go()" });
  document.body.appendChild(keyed);
  const unkeyedDown = hostElement("button", { "on-keydown": "#recv.go()" });
  document.body.appendChild(unkeyedDown);
  const unkeyedUp = hostElement("button", { "on-keyup": "#recv.go()" });
  document.body.appendChild(unkeyedUp);

  const enterWarns = warn.mock.calls
    .map((call) => String(call.arguments[0]))
    .filter((message) => message.includes("Enter/Space"));
  assert.equal(enterWarns.length, 2, "the two unkeyed buttons warn; the keyed one does not");
  assert.ok(enterWarns[0]!.includes("on-keydown"));
  assert.ok(enterWarns[1]!.includes("on-keyup"));
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

test("implements order decides shared verbs when an earlier name registers after attach", () => {
  const receiver = hostElement("div", { id: "route3", implements: "late-shared beta" });
  document.body.appendChild(receiver);

  defineImplementation(
    "late-shared",
    { tags: ["div"], verbs: { shared: "undefined" } },
    () => ({
      shared: () => {
        calls.push("late-shared.shared");
      },
    }),
  );

  dispatchInteraction(receiver, "shared");
  assert.deepEqual(calls, ["late-shared.shared"]);
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

test("an interaction right after insertion is handled synchronously, never queued", async () => {
  const receiver = hostElement("div", { id: "late", implements: "alpha" });
  document.body.appendChild(receiver);

  const early = dispatchInteraction(receiver, "go");
  assert.equal(early.handled, true);
  assert.equal(early.error, undefined);
  assert.deepEqual(calls, ["alpha.go"]);

  const later = dispatchInteraction(receiver, "go");
  assert.equal(later.handled, true);
  assert.equal(later.error, undefined);
  assert.deepEqual(calls, ["alpha.go", "alpha.go"]);
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

test("a DOM move re-runs connectedCallback and re-wires on* handlers for kept implementations", async () => {
  const receiver = hostElement("div", { id: "moved", implements: "stateful alpha" });
  document.body.appendChild(receiver);
  await flush();

  calls.length = 0;
  receiver.dispatchEvent(new Event("input"));
  assert.deepEqual(calls, ["alpha.oninput"]);

  receiver.remove();
  assert.ok(calls.includes("stateful.disconnected"));
  calls.length = 0;
  receiver.dispatchEvent(new Event("input"));
  assert.equal(calls.length, 0);

  document.body.appendChild(receiver);
  await flush();
  assert.ok(calls.includes("stateful.connected"));

  calls.length = 0;
  receiver.dispatchEvent(new Event("input"));
  assert.deepEqual(calls, ["alpha.oninput"]);
});

test("a config attribute registered after the host was defined still reaches attributeChangedCallback", async () => {
  const lateCalls: string[] = [];
  defineImplementation("late-config", { config: { events: "string | undefined" }, verbs: {} }, () => ({
    attributeChangedCallback: (name: string) => {
      lateCalls.push(name);
    },
  }));
  const host = hostElement("div", { implements: "late-config", "late-config-events": "a" });
  document.body.appendChild(host);
  await flush();

  lateCalls.length = 0;
  host.setAttribute("late-config-events", "b");
  await flush();
  assert.deepEqual(lateCalls, ["late-config-events"]);
});

test("an implementation that throws at attach is logged and the host still becomes ready", async () => {
  defineImplementation("boom-attach", { verbs: { go: "undefined" } }, () => {
    throw new Error("boom");
  });
  const receiver = hostElement("div", { id: "boom", implements: "boom-attach alpha" });
  document.body.appendChild(receiver);

  const event = dispatchInteraction(receiver, "go");
  assert.equal(event.handled, true);
  assert.equal(event.error, undefined);
  assert.deepEqual(calls, ["alpha.go"]);
});

test("an implementation registered after the element connected attaches without a reconnect", async () => {
  const gammaCalls: string[] = [];
  const host = hostElement("div", { id: "live", implements: "gamma alpha" });
  document.body.appendChild(host);
  await flush();

  const missing = dispatchInteraction(host, "ping");
  assert.equal(missing.handled, false);

  defineImplementation("gamma", { verbs: { ping: "undefined" } }, () => ({
    ping: () => {
      gammaCalls.push("gamma.ping");
    },
  }));

  const attached = dispatchInteraction(host, "ping");
  assert.equal(attached.handled, true);
  assert.equal(attached.error, undefined);
  assert.deepEqual(gammaCalls, ["gamma.ping"]);

  const alphaStill = dispatchInteraction(host, "go");
  assert.equal(alphaStill.handled, true);
  assert.deepEqual(calls, ["alpha.go"]);
  assert.equal((host as HTMLElement & { didEnsure: boolean }).didEnsure, true);
});

test("a name that registers before the turn settles is not reported as missing", async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  try {
    const host = hostElement("div", { id: "quiet", implements: "quiet-late" });
    document.body.appendChild(host);
    defineImplementation("quiet-late", { verbs: { ping: "undefined" } }, () => ({
      ping: () => undefined,
    }));
    assert.equal((host as HTMLElement & { didEnsure: boolean }).didEnsure, true);
  } finally {
    console.error = original;
  }
  await flush();
  assert.deepEqual(
    errors.filter((message) => message.includes("quiet-late")),
    [],
    "no missing-name report for an implementation that registered before the turn settles",
  );
});

test("a name still missing when the turn settles is reported once", async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  try {
    document.body.appendChild(hostElement("div", { id: "loud", implements: "never-registers" }));
    document.body.appendChild(hostElement("div", { id: "loud2", implements: "never-registers" }));
    await flush();
  } finally {
    console.error = original;
  }
  const reports = errors.filter((message) => message.includes("never-registers"));
  assert.equal(reports.length, 2, "one report per element with the missing name");
});

test("on-intersect-* needs no implements and never warns about a missing event", (t) => {
  const warn = t.mock.method(console, "warn");
  const trigger = hostElement("section", { "on-intersect-enter": "#recv.go()" });
  document.body.appendChild(trigger);
  assert.equal(warn.mock.callCount(), 0);
  trigger.remove();
});

test("an intersect crossing runs only the phrases whose margin matches", async () => {
  const receiver = hostElement("div", { id: "spy", implements: "alpha" });
  const trigger = hostElement("section", { "on-intersect-half": "0px: #spy.go(); 50px: #spy.go()" });
  document.body.append(trigger, receiver);
  await flush();

  const zero = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "0px");
  const fifty = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "50px");
  assert.ok(zero && fifty);

  zero!.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 0.6 }]);
  assert.deepEqual(calls, ["alpha.go"], "only the 0px phrase runs on the 0px observer");
  calls.length = 0;
  fifty!.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 0.6 }]);
  assert.deepEqual(calls, ["alpha.go"], "the 50px phrase runs on the 50px observer");
});

test("enter fires on entering and leave on leaving from one observer", async () => {
  const receiver = hostElement("div", { id: "both", implements: "alpha" });
  const trigger = hostElement("section", {
    "on-intersect-enter": "#both.go()",
    "on-intersect-leave": "#both.go()",
  });
  document.body.append(trigger, receiver);
  await flush();

  const observers = FakeIntersectionObserver.instances.filter((o) => o.observed.includes(trigger));
  assert.equal(observers.length, 1, "enter and leave share one observer");
  const observer = observers[0]!;
  observer.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 1 }]);
  observer.trigger([{ target: trigger, isIntersecting: false, intersectionRatio: 0 }]);
  observer.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 1 }]);
  observer.trigger([{ target: trigger, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(calls, ["alpha.go", "alpha.go", "alpha.go", "alpha.go"]);
});

test("once() is the only filter for intersect crossings", async () => {
  const receiver = hostElement("div", { id: "once", implements: "alpha" });
  const trigger = hostElement("section", { "on-intersect-enter": "#once.once().go()" });
  document.body.append(trigger, receiver);
  await flush();

  const observer = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "0px")!;
  observer.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 1 }]);
  observer.trigger([{ target: trigger, isIntersecting: false, intersectionRatio: 0 }]);
  observer.trigger([{ target: trigger, isIntersecting: true, intersectionRatio: 1 }]);
  assert.deepEqual(calls, ["alpha.go"], "once() gates the phrase across later crossings");
});

test("intersect observers are rebuilt on attribute change and torn down on disconnect", async () => {
  const trigger = hostElement("section", { "on-intersect-enter": "10px: #recv.go()" });
  document.body.appendChild(trigger);
  await flush();
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "10px");

  trigger.setAttribute("on-intersect-enter", "20px: #recv.go()");
  assert.equal(FakeIntersectionObserver.instances.length, 2);
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.length, 0, "the old observer was disconnected");
  assert.equal(FakeIntersectionObserver.instances[1]!.rootMargin, "20px");

  trigger.remove();
  assert.equal(FakeIntersectionObserver.instances[1]!.observed.length, 0, "disconnect tears down the observer");
});
