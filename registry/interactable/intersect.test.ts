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
let normaliseRootMargin: (key?: string) => string;
let syncIntersect: (el: Element) => void;
let teardownIntersect: (el: Element) => void;
let isImplementationEvent: (el: Element, type: string) => boolean;
let parse: (value: string, eventName?: string) => import("@interactable/parser.ts").Phrase[];
let runPhrases: (source: Element, value: string, ev: Event) => void;
let InteractionEvent: typeof import("@interactable/interaction-event.ts").InteractionEvent;
const { IS_HOST } = await import("@interactable/host.ts");

before(async () => {
  dom = setupJsdom();
  installFakeIntersectionObserver();
  installFakeResizeObserver();
  resetFakeResizeObserver();
  ({ INTERSECT_EVENT_NAMES } = await import("@interactable/intersect.ts"));
  ({ normaliseRootMargin } = await import("@interactable/intersect.ts"));
  ({ syncIntersect } = await import("@interactable/intersect.ts"));
  ({ teardownIntersect } = await import("@interactable/intersect.ts"));
  ({ isImplementationEvent } = await import("@interactable/events.ts"));
  ({ parse } = await import("@interactable/parser.ts"));
  ({ runPhrases } = await import("@interactable/executor.ts"));
  ({ InteractionEvent } = await import("@interactable/interaction-event.ts"));
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  resetFakeIntersectionObserver();
  document.body.replaceChildren();
});

function wireTrigger(el: Element, type: string): void {
  el.addEventListener(type, (ev) => {
    runPhrases(el, el.getAttribute(`on-${type}`) ?? "", ev);
  });
}

function wireReceiver(el: Element, into: string[]): void {
  (el as unknown as Record<PropertyKey, unknown>)[IS_HOST] = true;
  el.addEventListener("interaction", (raw) => {
    const event = raw as InstanceType<typeof InteractionEvent>;
    event.handled = true;
    into.push(event.verb);
  });
}

function make(type: string, value: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(`on-${type}`, value);
  document.body.append(el);
  return el;
}

function makeBoth(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("on-intersect-enter", "#a.show()");
  el.setAttribute("on-intersect-leave", "#b.show()");
  document.body.append(el);
  return el;
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

test("the three intersect names are enter, leave and full", () => {
  assert.deepEqual([...INTERSECT_EVENT_NAMES].sort(), [
    "intersect-enter",
    "intersect-full",
    "intersect-leave",
  ]);
  assert.equal(INTERSECT_EVENT_NAMES.has("intersect-half"), false);
});

test("normaliseRootMargin: a missing or empty key means 0px", () => {
  assert.equal(normaliseRootMargin(undefined), "0px");
  assert.equal(normaliseRootMargin(""), "0px");
  assert.equal(normaliseRootMargin("   "), "0px");
});

test("normaliseRootMargin: px lengths and percentages pass through, whitespace collapses", () => {
  assert.equal(normaliseRootMargin("10px"), "10px");
  assert.equal(normaliseRootMargin(" 10px  20px "), "10px 20px");
  assert.equal(normaliseRootMargin("-50%"), "-50%");
  assert.equal(normaliseRootMargin("0px 0px -50% 0px"), "0px 0px -50% 0px");
  assert.equal(normaliseRootMargin("0"), "0");
});

test("normaliseRootMargin: only px or % is legal, and the error names the restriction", () => {
  assert.throws(() => normaliseRootMargin("red"));
  assert.throws(() => normaliseRootMargin("10px auto"));
  assert.throws(() => normaliseRootMargin("calc(100% - 10px)"));
  assert.throws(() => normaliseRootMargin("10px 20px 30px 40px 50px"));
  assert.throws(() => normaliseRootMargin("10"));
  assert.throws(() => normaliseRootMargin("4.6rem"), /rootMargin accepts only px or %/);
  assert.throws(() => normaliseRootMargin("1.5rem"), /rootMargin accepts only px or %/);
});

test("under the intersect names an invalid margin key drops and logs the phrase", (t) => {
  const spy = t.mock.method(console, "error");
  const phrases = parse("red: #a.show(); 10px: #b.show()", "intersect-enter");
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0]!.key, "10px");
  assert.equal(spy.mock.callCount(), 1);
});

test("a 4.6rem intersect key is a parse error naming px or %", (t) => {
  const spy = t.mock.method(console, "error");
  const phrases = parse("4.6rem: #a.show(); 10px: #b.show()", "intersect-enter");
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0]!.key, "10px");
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("4.6rem"), spy.mock.calls[0]!.arguments[0] as string);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("rootMargin accepts only px or %"));
});

test("per-; phrases under one attribute observe separate margins", () => {
  const el = make("intersect-enter", "10px: #a.show(); 20px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 2);
  const margins = FakeIntersectionObserver.instances.map((o) => o.rootMargin).sort();
  assert.deepEqual(margins, ["10px", "20px"]);
  for (const observer of FakeIntersectionObserver.instances) {
    assert.ok(observer.observed.includes(el));
  }
});

test("phrases sharing a rootMargin share one observer", () => {
  const el = make("intersect-enter", "0px: #a.show(); 0px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px");
});

test("the viewport is the root: no root element is passed", () => {
  const el = make("intersect-full", "#a.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances[0]!.root, null);
});

test("every observer is constructed with the 101-value threshold list", () => {
  const el = make("intersect-enter", "#a.show()");
  syncIntersect(el);
  const thresholds = FakeIntersectionObserver.instances[0]!.thresholds;
  assert.equal(thresholds.length, 101);
  assert.equal(thresholds[0], 0);
  assert.equal(thresholds[100], 1);
  assert.equal(thresholds[50], 0.5);
});

test("enter fires on the initial intersecting report; leave never fires on the initial report", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["enter"]);
});

test("an initial non-intersecting report fires nothing", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  FakeIntersectionObserver.instances[0]!.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, []);
});

test("a true then false report fires enter then leave", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([seenAt(el, 100, 100)]);
  observer.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, ["enter", "leave"]);
});

test("false then true then false fires enter then leave, with no leave off the first false", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([seenAt(el, 700, 100)]);
  observer.trigger([seenAt(el, 100, 100)]);
  observer.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, ["enter", "leave"]);
});

test("short element sliding in from the bottom: enter once, full once in each direction, leave once", () => {
  const el = document.createElement("div");
  el.setAttribute("on-intersect-enter", "#a.show()");
  el.setAttribute("on-intersect-full", "#b.show()");
  el.setAttribute("on-intersect-leave", "#c.show()");
  document.body.append(el);
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-full", () => seen.push("full"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;

  observer.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(seen, [], "below the box: nothing fires");

  observer.trigger([seenAt(el, 550, 100)]);
  assert.deepEqual(seen, ["enter"], "leading edge enters the box");

  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(seen, ["enter", "full"], "entirely inside: full becomes true");

  observer.trigger([seenAt(el, -50, 100)]);
  assert.deepEqual(seen, ["enter", "full", "full"], "leaving through the top: full flips false");

  observer.trigger([seenAt(el, -150, 100)]);
  assert.deepEqual(seen, ["enter", "full", "full", "leave"], "out the top: leave fires once");
});

test("full fires at the one position where an exactly-box-height element's edges coincide", () => {
  const el = make("intersect-full", "#a.show()");
  const seen: string[] = [];
  el.addEventListener("intersect-full", (ev) => seen.push((ev as Event & { key?: string }).key ?? ""));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;

  observer.trigger([seenAt(el, 600, 600)]);
  assert.deepEqual(seen, [], "edges apart: not full");

  observer.trigger([seenAt(el, 0, 600)]);
  assert.deepEqual(seen, ["0px"], "edges coincide: full fires");

  observer.trigger([seenAt(el, -50, 600)]);
  assert.deepEqual(seen, ["0px", "0px"], "off by a hair: full flips back");
});

test("an element taller than the box: enter once, leave once, full never", () => {
  const el = document.createElement("div");
  el.setAttribute("on-intersect-enter", "#a.show()");
  el.setAttribute("on-intersect-full", "#b.show()");
  el.setAttribute("on-intersect-leave", "#c.show()");
  document.body.append(el);
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-full", () => seen.push("full"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;

  observer.trigger([seenAt(el, 800, 1000)]);
  observer.trigger([seenAt(el, 550, 1000)]);
  assert.deepEqual(seen, ["enter"], "a taller section enters once");

  observer.trigger([seenAt(el, -200, 1000)]);
  observer.trigger([seenAt(el, -400, 1000)]);
  assert.deepEqual(seen, ["enter"], "covering the box: full never fires, no repeats");

  observer.trigger([seenAt(el, -1000, 1000)]);
  assert.deepEqual(seen, ["enter", "leave"], "leaves once out the top");
});

test("a -50% top margin on enter fires when the element's edge crosses the viewport's vertical centre", () => {
  const bottomHalf = { top: 300, right: 800, bottom: 600, left: 0, width: 800, height: 300 };

  const shortEl = make("intersect-enter", "-50% 0px 0px 0px: #a.show()");
  const shortSeen: string[] = [];
  shortEl.addEventListener("intersect-enter", () => shortSeen.push("enter"));
  syncIntersect(shortEl);
  const shortObserver = FakeIntersectionObserver.instances[0]!;
  assert.equal(shortObserver.rootMargin, "-50% 0px 0px 0px");
  shortObserver.trigger([seenAt(shortEl, 100, 100, bottomHalf)]);
  assert.deepEqual(shortSeen, [], "above the centre line: not entered");
  shortObserver.trigger([seenAt(shortEl, 250, 100, bottomHalf)]);
  assert.deepEqual(shortSeen, ["enter"], "bottom edge crosses the centre: entered");
  shortObserver.trigger([seenAt(shortEl, 400, 100, bottomHalf)]);
  assert.deepEqual(shortSeen, ["enter"], "still inside: no repeat");

  const tallEl = make("intersect-enter", "-50% 0px 0px 0px: #a.show()");
  const tallSeen: string[] = [];
  tallEl.addEventListener("intersect-enter", () => tallSeen.push("enter"));
  syncIntersect(tallEl);
  const tallObserver = FakeIntersectionObserver.instances[1]!;
  tallObserver.trigger([seenAt(tallEl, -500, 800, bottomHalf)]);
  assert.deepEqual(tallSeen, [], "taller element ending above the line: not entered");
  tallObserver.trigger([seenAt(tallEl, -480, 800, bottomHalf)]);
  assert.deepEqual(tallSeen, ["enter"], "taller element's bottom edge crosses the centre: entered");
});

test("two margins on one element make two observers; a shared margin makes one", () => {
  const two = make("intersect-enter", "0px: #a.show(); -74px 0px 0px 0px: #b.show()");
  syncIntersect(two);
  assert.equal(FakeIntersectionObserver.instances.length, 2);
  const margins = FakeIntersectionObserver.instances.map((o) => o.rootMargin).sort();
  assert.deepEqual(margins, ["-74px 0px 0px 0px", "0px"]);
  resetFakeIntersectionObserver();

  const shared = document.createElement("div");
  shared.setAttribute("on-intersect-enter", "0px: #a.show()");
  shared.setAttribute("on-intersect-full", "0px: #b.show()");
  document.body.append(shared);
  const seen: string[] = [];
  shared.addEventListener("intersect-enter", () => seen.push("enter"));
  shared.addEventListener("intersect-full", () => seen.push("full"));
  syncIntersect(shared);
  assert.equal(FakeIntersectionObserver.instances.length, 1, "enter and full on one margin share one observer");
  const observer = FakeIntersectionObserver.instances[0]!;
  assert.equal(observer.rootMargin, "0px");
  observer.trigger([seenAt(shared, 100, 100)]);
  assert.deepEqual(seen, ["enter", "full"], "the shared observer evaluates both types");
});

test("on-intersect-half is an unknown attribute: no observer, no event, no error", (t) => {
  const spy = t.mock.method(console, "error");
  const el = make("intersect-half", "#a.show()");
  const seen: string[] = [];
  el.addEventListener("intersect-half", () => seen.push("half"));
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 0);
  assert.equal(seen.length, 0);
  assert.equal(spy.mock.callCount(), 0);
});

test("enter and leave on one element share a single observer", () => {
  const el = makeBoth();
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px");
  assert.equal(FakeIntersectionObserver.instances[0]!.thresholds.length, 101);
  assert.ok(FakeIntersectionObserver.instances[0]!.observed.includes(el));
});

test("syncIntersect is idempotent and teardownIntersect disconnects", () => {
  const el = make("intersect-enter", "10px: #a.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);

  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1, "unchanged state creates no new observer");
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.length, 1);

  teardownIntersect(el);
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.length, 0);
});

test("the margin key filter routes each crossing to its own observer", () => {
  const el = make("intersect-enter", "10px: #a.show(); 20px: #b.show()");
  const verbs: string[] = [];
  const a = document.createElement("div");
  a.id = "a";
  const b = document.createElement("div");
  b.id = "b";
  document.body.append(a, b);
  wireReceiver(a, verbs);
  wireReceiver(b, verbs);
  wireTrigger(el, "intersect-enter");

  syncIntersect(el);
  const ten = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "10px")!;
  const twenty = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "20px")!;
  ten.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(verbs, ["show"]);
  twenty.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(verbs, ["show", "show"]);
});

test("on-intersect-leave observes each margin and keys its phrases like the others", () => {
  const el = make("intersect-leave", "10px: #a.show(); 20px: #b.show()");
  const verbs: string[] = [];
  const a = document.createElement("div");
  a.id = "a";
  const b = document.createElement("div");
  b.id = "b";
  document.body.append(a, b);
  wireReceiver(a, verbs);
  wireReceiver(b, verbs);
  wireTrigger(el, "intersect-leave");

  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 2);
  const ten = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "10px")!;
  const twenty = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "20px")!;
  ten.trigger([seenAt(el, 100, 100)]);
  ten.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(verbs, ["show"], "only the 10px phrase runs on the 10px observer's leave");
  twenty.trigger([seenAt(el, 100, 100)]);
  twenty.trigger([seenAt(el, 700, 100)]);
  assert.deepEqual(verbs, ["show", "show"], "the 20px phrase runs on the 20px observer's leave");
});

test("once() is the only phrase-level gate for intersect crossings", () => {
  const el = make("intersect-enter", "#probe.once().show()");
  const probe = document.createElement("div");
  probe.id = "probe";
  document.body.append(probe);
  const verbs: string[] = [];
  wireReceiver(probe, verbs);
  wireTrigger(el, "intersect-enter");

  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([seenAt(el, 100, 100)]);
  observer.trigger([seenAt(el, 700, 100)]);
  observer.trigger([seenAt(el, 100, 100)]);
  assert.deepEqual(verbs, ["show"], "once() gates the phrase across every later crossing");
});

test("there is no bare on-intersect: only the three names are synthetic", () => {
  assert.equal(INTERSECT_EVENT_NAMES.has("intersect"), false);
  const el = document.createElement("div");
  assert.equal(isImplementationEvent(el, "intersect"), false);
  assert.deepEqual(parse("10px 20px: #a.show()", "intersect"), []);
});

test("normaliseRootMargin accepts a #id.height/#id.width reference token", () => {
  assert.equal(normaliseRootMargin("-#nav.height 0px 0px 0px"), "-#nav.height 0px 0px 0px");
  assert.equal(normaliseRootMargin("#nav.width"), "#nav.width");
  assert.equal(normaliseRootMargin("-#topnav.height 0px 0px 0px"), "-#topnav.height 0px 0px 0px");
  assert.throws(() => normaliseRootMargin("-#topnav.height 0px 0px 0px 1px"), /at most 4 values/);
});

test("a #id.height margin resolves to the measured height and rebuilds on resize", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.append(nav);
  const el = make("intersect-enter", "-#nav.height 0px 0px 0px: #a.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px 0px 0px 0px", "unmeasured resolves to 0");
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

test("phrases sharing a referenced margin share one observer", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.append(nav);
  const el = make("intersect-enter", "-#nav.height 0px 0px 0px: #a.show(); -#nav.height 0px 0px 0px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px 0px 0px 0px");
});

test("two sections referencing #nav share one observation; the last teardown unobserves", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.append(nav);
  const one = make("intersect-enter", "-#nav.height 0px 0px 0px: #a.show()");
  const two = make("intersect-enter", "-#nav.height 0px 0px 0px: #b.show()");
  syncIntersect(one);
  syncIntersect(two);
  const resize = FakeResizeObserver.instances[0]!;
  assert.equal(
    resize.observed.filter((target) => target === nav).length,
    1,
    "observe() is idempotent, so two referrers share one observation",
  );

  teardownIntersect(one);
  assert.ok(resize.observed.includes(nav), "one referrer left: still observed");
  teardownIntersect(two);
  assert.equal(resize.observed.includes(nav), false, "last referrer torn down: unobserved");
});

test("a referenced margin whose id is missing drops the phrase and logs once", (t) => {
  const spy = t.mock.method(console, "error");
  const el = make("intersect-enter", "-#ghost.height 0px 0px 0px: #a.show(); 10px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1, "only the literal-margin phrase survives");
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "10px");
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("#ghost"), spy.mock.calls[0]!.arguments[0] as string);
  syncIntersect(el);
  assert.equal(spy.mock.callCount(), 1, "the report is logged once");
});