import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  resetFakeIntersectionObserver,
} from "@tests/intersection-observer.ts";
import type { FakeEntry, RectLike } from "@tests/intersection-observer.ts";
import {
  FakeResizeObserver,
  installFakeResizeObserver,
  resetFakeResizeObserver,
} from "@tests/resize-observer.ts";

let dom: JSDOM;
let INTERSECT_EVENT_NAMES: ReadonlySet<string>;
let normaliseRootMargin: (token?: string | number) => string;
let readIntersectSpec: typeof import("@interactable/intersect.ts").readIntersectSpec;
let syncIntersect: (el: Element) => void;
let teardownIntersect: (el: Element) => void;
let isImplementationEvent: (el: Element, type: string) => boolean;
let parseEventValue: typeof import("@interactable/parser.ts").parseEventValue;
let InteractionEvent: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let ImplementationEvent: typeof import("@interactable/implementation-event.ts").ImplementationEvent;
let attach: (el: Element) => void;

before(async () => {
  dom = setupJsdom();
  installFakeIntersectionObserver();
  installFakeResizeObserver();
  resetFakeResizeObserver();
  ({ INTERSECT_EVENT_NAMES } = await import("@interactable/intersect.ts"));
  ({ normaliseRootMargin } = await import("@interactable/intersect.ts"));
  ({ readIntersectSpec } = await import("@interactable/intersect.ts"));
  ({ syncIntersect } = await import("@interactable/intersect.ts"));
  ({ teardownIntersect } = await import("@interactable/intersect.ts"));
  ({ isImplementationEvent } = await import("@interactable/events.ts"));
  ({ parseEventValue } = await import("@interactable/parser.ts"));
  ({ InteractionEvent } = await import("@interactable/interaction-event.ts"));
  ({ ImplementationEvent } = await import("@interactable/implementation-event.ts"));
  ({ attach } = await import("@interactable/attachment.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  resetFakeIntersectionObserver();
  document.body.replaceChildren();
});

function make(value: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = `<div on-intersect=${JSON.stringify(value)}></div>`;
  document.body.append(holder);
  return holder.firstElementChild as HTMLElement;
}

function box(top: number, height: number, left = 0, width = 100): RectLike {
  return { top, right: left + width, bottom: top + height, left, width, height };
}

function viewport(): RectLike {
  return { top: 0, right: 800, bottom: 600, left: 0, width: 800, height: 600 };
}

function overlap(outer: RectLike, inner: RectLike): RectLike {
  const top = Math.max(outer.top, inner.top);
  const bottom = Math.min(outer.bottom, inner.bottom);
  const left = Math.max(outer.left, inner.left);
  const right = Math.min(outer.right, inner.right);
  const width = right - left;
  const height = bottom - top;
  return {
    top,
    right,
    bottom,
    left,
    width: width > 0 ? width : 0,
    height: height > 0 ? height : 0,
  };
}

function seenAt(target: Element, top: number, height: number, root: RectLike = viewport(), width = 100): FakeEntry {
  const elBox = box(top, height, 0, width);
  return { target, boundingClientRect: elBox, rootBounds: root, intersectionRect: overlap(root, elBox) };
}

function observerFor(el: Element): FakeIntersectionObserver {
  const observer = FakeIntersectionObserver.instances.find((instance) => instance.observed.includes(el));
  assert.ok(observer !== undefined, "the element observes itself");
  return observer;
}

test("there is one intersect event", () => {
  assert.deepEqual([...INTERSECT_EVENT_NAMES], ["intersect"]);
});

test("isImplementationEvent knows intersect but not the retired names", () => {
  const el = document.createElement("div");
  assert.equal(isImplementationEvent(el, "intersect"), true);
  assert.equal(isImplementationEvent(el, "intersect-enter"), false);
  assert.equal(isImplementationEvent(el, "intersect-leave"), false);
  assert.equal(isImplementationEvent(el, "intersect-full"), false);
});

test("normaliseRootMargin validates one token at a time", () => {
  assert.equal(normaliseRootMargin(undefined), "0px");
  assert.equal(normaliseRootMargin(""), "0px");
  assert.equal(normaliseRootMargin("   "), "0px");
  assert.equal(normaliseRootMargin("10px"), "10px");
  assert.equal(normaliseRootMargin(" -50% "), "-50%");
  assert.equal(normaliseRootMargin("0"), "0");
  assert.equal(normaliseRootMargin("-#nav.height"), "-#nav.height");
  assert.equal(normaliseRootMargin("#nav.width"), "#nav.width");
  assert.throws(() => normaliseRootMargin("red"), /rootMargin accepts only px or %/);
  assert.throws(() => normaliseRootMargin("4.6rem"), /rootMargin accepts only px or %/);
  assert.throws(() => normaliseRootMargin("10px 20px"), /rootMargin accepts only px or %/);
});

test("readIntersectSpec builds one margin from handler fields", () => {
  const handlers = parseEventValue(
    "[(state: 'enter', block-start: '-#nav.height') => { #a() }, " +
      "(state: 'leave', block-start: '-#nav.height') => { #b() }]",
  );
  const spec = readIntersectSpec(handlers);
  assert.equal(spec.margin, "-#nav.height 0px 0px 0px");
  assert.deepEqual(spec.slots, {
    "block-start": "-#nav.height",
    "block-end": "0px",
    "inline-start": "0px",
    "inline-end": "0px",
  });
  assert.deepEqual(spec.declared, ["block-start"]);
});

test("readIntersectSpec rejects bad margins and disagreement", () => {
  const bad = parseEventValue("(state: 'enter', block-start: 'red') => { #a() }");
  assert.throws(() => readIntersectSpec(bad), /rootMargin accepts only px or %/);
  const disagree = parseEventValue(
    "[(state: 'enter', block-start: '10px') => { #a() }, " +
      "(state: 'leave', block-start: '20px') => { #b() }]",
  );
  assert.throws(() => readIntersectSpec(disagree), /disagree on "block-start"/);
  const sets = parseEventValue(
    "[(state: 'enter', block-start: '10px') => { #a() }, (state: 'leave') => { #b() }]",
  );
  assert.throws(() => readIntersectSpec(sets), /disagree on the margin set/);
});

test("a bare on-intersect has a 0px margin and no state filter", () => {
  const el = make("() => { #x.go() }");
  attach(el);
  assert.equal(observerFor(el).rootMargin, "0px 0px 0px 0px");
});

test("enter and leave in one handler list share one observer", () => {
  const el = make(
    "[(state: 'enter', block-start: '0px') => { #a.go() }, " +
      "(state: 'leave', block-start: '0px') => { #b.go() }]",
  );
  attach(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px 0px 0px 0px");
});

test("handlers that disagree on the margin are a wire-time error with no observer", (t) => {
  const spy = t.mock.method(console, "error");
  const el = make(
    "[(state: 'enter', block-start: '10px') => { #a.go() }, " +
      "(state: 'enter', block-start: '20px') => { #b.go() }]",
  );
  attach(el);
  assert.equal(FakeIntersectionObserver.instances.length, 0);
  assert.ok(spy.mock.callCount() >= 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("disagree"));
});

test("every observer is constructed with the viewport as root and the 101-value threshold list", () => {
  const el = make("(state: 'enter') => { #a.go() }");
  attach(el);
  const observer = observerFor(el);
  assert.equal(observer.root, null);
  assert.equal(observer.thresholds.length, 101);
  assert.equal(observer.thresholds[0], 0);
  assert.equal(observer.thresholds[100], 1);
  assert.equal(observer.thresholds[50], 0.5);
});

test("the logical slots map to physical sides for horizontal ltr", () => {
  const el = make(
    "(state: 'enter', block-start: '1px', block-end: '2px', inline-start: '3px', inline-end: '4px') => { #a.go() }",
  );
  attach(el);
  assert.equal(observerFor(el).rootMargin, "1px 4px 2px 3px");
});

test("inline slots follow direction rtl", () => {
  const el = make(
    "(state: 'enter', block-start: '1px', block-end: '2px', inline-start: '3px', inline-end: '4px') => { #a.go() }",
  );
  el.style.direction = "rtl";
  attach(el);
  assert.equal(observerFor(el).rootMargin, "1px 3px 2px 4px");
});

test("vertical writing modes swap the axes", () => {
  const rl = make(
    "(state: 'enter', block-start: '1px', block-end: '2px', inline-start: '3px', inline-end: '4px') => { #a.go() }",
  );
  rl.style.writingMode = "vertical-rl";
  attach(rl);
  assert.equal(observerFor(rl).rootMargin, "3px 1px 4px 2px");
  resetFakeIntersectionObserver();

  const lr = make(
    "(state: 'enter', block-start: '1px', block-end: '2px', inline-start: '3px', inline-end: '4px') => { #b.go() }",
  );
  lr.style.writingMode = "vertical-lr";
  attach(lr);
  assert.equal(observerFor(lr).rootMargin, "3px 2px 4px 1px");
});

test("state enter and leave run from one observer", () => {
  const receiver = document.createElement("div");
  receiver.id = "r";
  const el = make(
    "[(state: 'enter') => { #r.entered() }, (state: 'leave') => { #r.left() }]",
  );
  document.body.append(receiver);
  attach(el);
  attach(receiver);
  const seen: string[] = [];
  receiver.addEventListener("interaction", (raw) => {
    const event = raw as InstanceType<typeof InteractionEvent>;
    event.handled = true;
    seen.push(event.verb);
  });

  const observer = observerFor(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["entered"]);
  observer.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, ["entered", "left"]);
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["entered", "left", "entered"]);
});

test("an initial non-intersecting report fires nothing", () => {
  const el = make(
    "[(state: 'enter') => { #a.go() }, (state: 'leave') => { #b.go() }]",
  );
  attach(el);
  const seen: string[] = [];
  el.addEventListener("intersect", (ev) => {
    const event = ev as InstanceType<typeof ImplementationEvent>;
    seen.push(`${event.values["state"] ?? ""}:${event.values["full"] ?? ""}`);
  });
  observerFor(el).trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, []);
});

test("full filters on becoming full and leaving fullness", () => {
  const el = make(
    "[(full: true) => { #a.go() }, (full: false) => { #b.go() }]",
  );
  attach(el);
  const seen: string[] = [];
  el.addEventListener("intersect", (ev) => {
    const event = ev as InstanceType<typeof ImplementationEvent>;
    if (event.values["full"] !== undefined) seen.push(event.values["full"]!);
  });
  const observer = observerFor(el);
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["true"], "entirely inside: full becomes true");
  observer.trigger([seenAt(el, -50, 100)]);
  assert.deepEqual(seen, ["true", "false"], "leaving through the top: full flips false");
});

test("one dispatch carries the union of what changed", () => {
  const el = make("(state: 'enter', full: true) => { #a.go() }");
  attach(el);
  const seen: Array<Record<string, string>> = [];
  el.addEventListener("intersect", (ev) => {
    seen.push({ ...(ev as InstanceType<typeof ImplementationEvent>).values });
  });
  observerFor(el).trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, [{ state: "enter", full: "true" }]);
});

test("a state literal that does not match the crossing is skipped", () => {
  const el = make("(state: 'enter') => { #a.go() }");
  attach(el);
  const seen: string[] = [];
  el.addEventListener("intersect", () => seen.push("any"));
  const observer = observerFor(el);
  observer.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, [], "a leave crossing runs no enter phrase");
});

test("a #id.height margin resolves to the measured height and rebuilds on resize", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.append(nav);
  const el = make("(state: 'enter', block-start: '-#nav.height') => { #a.go() }");
  attach(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(observerFor(el).rootMargin, "0px 0px 0px 0px", "unmeasured resolves to 0");
  const resize = FakeResizeObserver.instances[0]!;
  assert.ok(resize.observed.includes(nav), "the referenced element is observed");

  resize.trigger([{ target: nav, borderBoxSize: [{ blockSize: 74, inlineSize: 100 }] }]);
  assert.equal(FakeIntersectionObserver.instances.length, 2, "a resize rebuilt the observers");
  assert.equal(FakeIntersectionObserver.instances[1]!.rootMargin, "-74px 0px 0px 0px");

  resize.trigger([{ target: nav, borderBoxSize: [{ blockSize: 80, inlineSize: 100 }] }]);
  assert.equal(FakeIntersectionObserver.instances.length, 3, "a different rounded height rebuilds");
  assert.equal(FakeIntersectionObserver.instances[2]!.rootMargin, "-80px 0px 0px 0px");

  resize.trigger([{ target: nav, borderBoxSize: [{ blockSize: 80.4, inlineSize: 100 }] }]);
  assert.equal(FakeIntersectionObserver.instances.length, 3, "sub-pixel churn is a no-op");
});

test("a referenced margin whose id is missing drops the phrase and logs once", (t) => {
  const spy = t.mock.method(console, "error");
  const el = make("(state: 'enter', block-start: '-#ghost.height') => { #a.go() }");
  attach(el);
  assert.equal(FakeIntersectionObserver.instances.length, 0, "no observer for a missing reference");
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("#ghost"));
  syncIntersect(el);
  assert.equal(spy.mock.callCount(), 1, "the report is logged once");
});

test("syncIntersect is idempotent and teardownIntersect disconnects", () => {
  const el = make("(state: 'enter', block-start: '10px') => { #a.go() }");
  attach(el);
  const observer = observerFor(el);
  const count = FakeIntersectionObserver.instances.length;
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, count, "unchanged state creates no new observer");
  teardownIntersect(el);
  assert.equal(observer.observed.length, 0, "teardown disconnects the observer");
});

test("a rebuild keeps entered state: the rebuilt observer's first non-overlap leaves once", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.append(nav);
  const el = make(
    "[(state: 'enter', block-start: '-#nav.height') => { #a.go() }, " +
      "(state: 'leave', block-start: '-#nav.height') => { #b.go() }]",
  );
  attach(el);
  const seen: string[] = [];
  el.addEventListener("intersect", (ev) => {
    const event = ev as InstanceType<typeof ImplementationEvent>;
    seen.push(event.values["state"] ?? "");
  });
  observerFor(el).trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["enter"]);

  const resize = FakeResizeObserver.instances[0]!;
  resize.trigger([{ target: nav, borderBoxSize: [{ blockSize: 74, inlineSize: 100 }] }]);
  assert.deepEqual(seen, ["enter"], "teardown fires no event");
  assert.equal(FakeIntersectionObserver.instances.length, 2, "the resize rebuilt the observer");
  const rebuilt = FakeIntersectionObserver.instances[1]!;
  assert.equal(rebuilt.rootMargin, "-74px 0px 0px 0px");
  rebuilt.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, ["enter", "leave"], "the rebuilt observer's first report leaves once");
});

test("once() gates the phrase across later crossings", () => {
  const receiver = document.createElement("div");
  receiver.id = "r";
  const el = make("(state: 'enter') => { #r.once().go() }");
  document.body.append(receiver);
  attach(el);
  attach(receiver);
  const seen: string[] = [];
  receiver.addEventListener("interaction", (raw) => {
    const event = raw as InstanceType<typeof InteractionEvent>;
    event.handled = true;
    seen.push(event.verb);
  });
  const observer = observerFor(el);
  observer.trigger([seenAt(el, 100, 100)]);
  observer.trigger([seenAt(el, 700, 100)]);
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["go"]);
});

test("an unknown intersect slot is a wire-time error and creates no observer", (t) => {
  const spy = t.mock.method(console, "error");
  const el = make("(side: '0px') => { #a.go() }");
  attach(el);
  assert.equal(FakeIntersectionObserver.instances.length, 0);
  assert.ok(spy.mock.callCount() >= 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("is not a field of event"));
});

test("a typed margin binds the resolved margin", () => {
  const receiver = document.createElement("div");
  receiver.id = "r";
  const el = make(
    "[(state: 'enter', block-start: '10px') => { #r.hit() }, (state: 'enter', block-start: number) => { #r.set(block-start) }]",
  );
  document.body.append(receiver);
  attach(el);
  attach(receiver);
  const seen: unknown[] = [];
  receiver.addEventListener("interaction", (raw) => {
    const event = raw as InstanceType<typeof InteractionEvent>;
    event.handled = true;
    if (event.verb === "set") seen.push(event.arg);
  });
  observerFor(el).trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, [10], "the resolved 10px margin binds as the number 10");
});

test("a typed margin rides the intersect event with its resolved value", () => {
  const el = make("(state: 'enter', block-start: '10px', block-end: number) => { #a.go() }");
  attach(el);
  assert.equal(observerFor(el).rootMargin, "10px 0px 0px 0px");
  const seen: Array<Record<string, string>> = [];
  el.addEventListener("intersect", (ev) => {
    seen.push({ ...(ev as InstanceType<typeof ImplementationEvent>).values });
  });
  observerFor(el).trigger([seenAt(el, 100, 100)]);
  assert.equal(seen[0]!["block-start"], "10px");
  assert.equal(seen[0]!["block-end"], "0px");
});
