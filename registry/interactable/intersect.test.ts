import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  resetFakeIntersectionObserver,
} from "@tests/intersection-observer.ts";

let dom: JSDOM;
let INTERSECT_THRESHOLDS: Record<string, number>;
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
  ({ INTERSECT_THRESHOLDS } = await import("@interactable/intersect.ts"));
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

test("the four intersect names map to thresholds 0, 0, 0.5, 1", () => {
  assert.equal(INTERSECT_THRESHOLDS["intersect-enter"], 0);
  assert.equal(INTERSECT_THRESHOLDS["intersect-leave"], 0);
  assert.equal(INTERSECT_THRESHOLDS["intersect-half"], 0.5);
  assert.equal(INTERSECT_THRESHOLDS["intersect-full"], 1);
  assert.deepEqual([...INTERSECT_EVENT_NAMES].sort(), [
    "intersect-enter",
    "intersect-full",
    "intersect-half",
    "intersect-leave",
  ]);
});

test("normaliseRootMargin: a missing or empty key means 0px", () => {
  assert.equal(normaliseRootMargin(undefined), "0px");
  assert.equal(normaliseRootMargin(""), "0px");
  assert.equal(normaliseRootMargin("   "), "0px");
});

test("normaliseRootMargin: lengths and percentages pass through, whitespace collapses", () => {
  assert.equal(normaliseRootMargin("10px"), "10px");
  assert.equal(normaliseRootMargin(" 10px  20px "), "10px 20px");
  assert.equal(normaliseRootMargin("-50%"), "-50%");
  assert.equal(normaliseRootMargin("0px 0px -50% 0px"), "0px 0px -50% 0px");
  assert.equal(normaliseRootMargin("1.5rem"), "1.5rem");
});

test("normaliseRootMargin: anything that is not CSS lengths or percentages throws", () => {
  assert.throws(() => normaliseRootMargin("red"));
  assert.throws(() => normaliseRootMargin("10px auto"));
  assert.throws(() => normaliseRootMargin("calc(100% - 10px)"));
  assert.throws(() => normaliseRootMargin("10px 20px 30px 40px 50px"));
  assert.throws(() => normaliseRootMargin("10"));
});

test("under the intersect names an invalid margin key drops and logs the phrase", (t) => {
  const spy = t.mock.method(console, "error");
  const phrases = parse("red: #a.show(); 10px: #b.show()", "intersect-half");
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0]!.key, "10px");
  assert.equal(spy.mock.callCount(), 1);
});

test("per-; phrases under one attribute observe separate margins", () => {
  const el = make("intersect-half", "10px: #a.show(); 20px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 2);
  const margins = FakeIntersectionObserver.instances.map((o) => o.rootMargin).sort();
  assert.deepEqual(margins, ["10px", "20px"]);
  for (const observer of FakeIntersectionObserver.instances) {
    assert.deepEqual(observer.thresholds, [0.5]);
    assert.ok(observer.observed.includes(el));
  }
});

test("phrases sharing a (threshold, rootMargin) triple share one observer", () => {
  const el = make("intersect-enter", "0px: #a.show(); 0px: #b.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px");
  assert.deepEqual(FakeIntersectionObserver.instances[0]!.thresholds, [0]);
});

test("the viewport is the root: no root element is passed", () => {
  const el = make("intersect-full", "#a.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances[0]!.root, null);
});

test("threshold crossings fire in both directions for half/full", () => {
  const el = make("intersect-half", "#a.show()");
  const seen: string[] = [];
  el.addEventListener("intersect-half", (ev) => seen.push((ev as Event & { key?: string }).key ?? ""));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
  observer.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
  assert.deepEqual(seen, ["0px", "0px", "0px"]);
});

test("enter fires on the initial intersecting report; leave never fires on the initial report", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  assert.deepEqual(seen, ["enter"]);
});

test("an initial non-intersecting report fires nothing", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  FakeIntersectionObserver.instances[0]!.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(seen, []);
});

test("a true then false report fires enter then leave", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  observer.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(seen, ["enter", "leave"]);
});

test("false then true then false fires enter then leave, with no leave off the first false", () => {
  const el = makeBoth();
  const seen: string[] = [];
  el.addEventListener("intersect-enter", () => seen.push("enter"));
  el.addEventListener("intersect-leave", () => seen.push("leave"));
  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  observer.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(seen, ["enter", "leave"]);
});

test("enter and leave on one element share a single observer", () => {
  const el = makeBoth();
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(FakeIntersectionObserver.instances[0]!.rootMargin, "0px");
  assert.deepEqual(FakeIntersectionObserver.instances[0]!.thresholds, [0]);
  assert.ok(FakeIntersectionObserver.instances[0]!.observed.includes(el));
});

test("syncIntersect is idempotent and teardownIntersect disconnects", () => {
  const el = make("intersect-half", "10px: #a.show()");
  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1);

  syncIntersect(el);
  assert.equal(FakeIntersectionObserver.instances.length, 1, "unchanged state creates no new observer");
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.length, 1);

  teardownIntersect(el);
  assert.equal(FakeIntersectionObserver.instances[0]!.observed.length, 0);
});

test("the margin key filter routes each crossing to its own observer", () => {
  const el = make("intersect-half", "10px: #a.show(); 20px: #b.show()");
  const verbs: string[] = [];
  const a = document.createElement("div");
  a.id = "a";
  const b = document.createElement("div");
  b.id = "b";
  document.body.append(a, b);
  wireReceiver(a, verbs);
  wireReceiver(b, verbs);
  wireTrigger(el, "intersect-half");

  syncIntersect(el);
  const ten = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "10px")!;
  const twenty = FakeIntersectionObserver.instances.find((o) => o.rootMargin === "20px")!;
  ten.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
  assert.deepEqual(verbs, ["show"]);
  twenty.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
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
  assert.deepEqual(ten.thresholds, [0]);
  assert.deepEqual(twenty.thresholds, [0]);
  ten.trigger([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  ten.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(verbs, ["show"], "only the 10px phrase runs on the 10px observer's leave");
  twenty.trigger([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  twenty.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  assert.deepEqual(verbs, ["show", "show"], "the 20px phrase runs on the 20px observer's leave");
});

test("once() is the only phrase-level gate for intersect crossings", () => {
  const el = make("intersect-half", "#probe.once().show()");
  const probe = document.createElement("div");
  probe.id = "probe";
  document.body.append(probe);
  const verbs: string[] = [];
  wireReceiver(probe, verbs);
  wireTrigger(el, "intersect-half");

  syncIntersect(el);
  const observer = FakeIntersectionObserver.instances[0]!;
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
  observer.trigger([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  observer.trigger([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
  assert.deepEqual(verbs, ["show"], "once() gates the phrase across every later crossing");
});

test("there is no bare on-intersect: only the four names are synthetic", () => {
  assert.equal(INTERSECT_EVENT_NAMES.has("intersect"), false);
  const el = document.createElement("div");
  assert.equal(isImplementationEvent(el, "intersect"), false);
  assert.deepEqual(parse("10px 20px: #a.show()", "intersect"), []);
});