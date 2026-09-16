import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { clearPhraseState, runPhrases } from "@interactable/executor.ts";
import { IS_HOST } from "@interactable/host.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

class FakeElement extends EventTarget {
  id: string;
  localName = "div";
  value = "";
  checked = false;
  valueAsNumber = NaN;
  private attrs = new Map<string, string>();

  constructor(id = "") {
    super();
    this.id = id;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
}

(FakeElement.prototype as unknown as Record<PropertyKey, unknown>)[IS_HOST] = true;

const byId = new Map<string, FakeElement>();
const created: FakeElement[] = [];

const documentStub = {
  getElementById: (id: string): FakeElement | null => byId.get(id) ?? null,
} as unknown as Document;

type Handler = (e: InteractionEvent, arg: unknown) => unknown;

function wireHost(receiver: FakeElement, verbs: Record<string, Handler>): void {
  receiver.addEventListener("interaction", (raw) => {
    const e = raw as InteractionEvent;
    const impl = verbs[e.verb];
    if (!impl) return;
    e.handled = true;
    try {
      e.result = impl(e, e.arg);
    } catch (err) {
      e.error = err;
    }
  });
}

function observe(receiver: FakeElement, into: InteractionEvent[]): void {
  receiver.addEventListener("interaction", (raw) => into.push(raw as InteractionEvent));
}

function el(id = ""): FakeElement {
  const element = new FakeElement(id);
  if (id !== "") byId.set(id, element);
  created.push(element);
  return element;
}

function run(source: FakeElement, value: string, ev: Event): void {
  runPhrases(source as unknown as Element, value, ev);
}

function keyEvent(key: string, type = "keydown"): Event {
  return Object.assign(new Event(type), { key });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  byId.clear();
  created.length = 0;
  globalThis.document = documentStub;
});

afterEach(() => {
  for (const element of created) clearPhraseState(element as unknown as Element);
  Reflect.deleteProperty(globalThis, "document");
});

test("dispatches an InteractionEvent at the receiver with verb, arg, source", () => {
  const receiver = el("modal");
  const seen: InteractionEvent[] = [];
  wireHost(receiver, { show: () => undefined });
  observe(receiver, seen);

  const trigger = el();
  trigger.value = "hi";
  run(trigger, "#modal.show()", new Event("click"));

  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.verb, "show");
  assert.equal(seen[0]!.arg, undefined);
  assert.strictEqual(seen[0]!.source, trigger as unknown as Element);
  assert.equal(seen[0]!.handled, true);
});

test("a chain runs its links in order", () => {
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    show: () => {
      order.push("show");
    },
    focus: () => {
      order.push("focus");
    },
  });

  run(el(), "#m.show().focus()", new Event("click"));
  assert.deepEqual(order, ["show", "focus"]);
});

test("a guard verb prevents the rest of the chain quietly", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    validate: (e) => {
      order.push("validate");
      e.preventDefault();
    },
    send: () => {
      order.push("send");
    },
  });

  run(el(), "#m.validate().send()", new Event("submit"));
  assert.deepEqual(order, ["validate"]);
  assert.equal(spy.mock.callCount(), 0);
});

test("a verb that throws aborts the chain and is logged once", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    boom: () => {
      order.push("boom");
      throw new Error("kaboom");
    },
    after: () => {
      order.push("after");
    },
  });

  const trigger = el();
  run(trigger, "#m.boom().after()", new Event("click"));
  assert.deepEqual(order, ["boom"]);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("threw: kaboom"));

  run(trigger, "#m.boom().after()", new Event("click"));
  assert.equal(spy.mock.callCount(), 1);
});

test("an unowned verb aborts the chain and is logged", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    show: () => {
      order.push("show");
    },
  });

  run(el(), "#m.missing().show()", new Event("click"));
  assert.deepEqual(order, []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("no implementation on <div#m> handles missing()"));
});

test("a non-host receiver is reported with the is= fix", (t) => {
  const spy = t.mock.method(console, "error");
  const plain = el("plain");
  (plain as unknown as Record<PropertyKey, unknown>)[IS_HOST] = false;

  run(el(), "#plain.show()", new Event("click"));
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      '#plain is not an interactable host; add is="interactable-div"',
    ),
  );
});

test("a host no implementation handles reports the implements list", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("plain");
  receiver.setAttribute("implements", "attributable");

  run(el(), "#plain.show()", new Event("click"));
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      'no implementation on <div#plain implements="attributable"> handles show()',
    ),
  );
});

test("semicolon phrases are independent", (t) => {
  const spy = t.mock.method(console, "error");
  const broken = el("broken");
  const other = el("other");
  wireHost(broken, {
    boom: () => {
      throw new Error("kaboom");
    },
  });
  wireHost(other, { show: () => undefined });

  run(el(), "#broken.boom(); #other.show()", new Event("click"));
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("threw: kaboom"));
});

test("once() gates the rest of its own chain", () => {
  const receiver = el("m");
  let showCalls = 0;
  let focusCalls = 0;
  wireHost(receiver, {
    show: () => {
      showCalls++;
    },
    focus: () => {
      focusCalls++;
    },
  });

  const trigger = el();
  run(trigger, "#m.once().show().focus()", new Event("click"));
  run(trigger, "#m.once().show().focus()", new Event("click"));
  assert.equal(showCalls, 1);
  assert.equal(focusCalls, 1);
});

test("once() governs from its position to the end of its chain", () => {
  const receiver = el("m");
  let xCalls = 0;
  let yCalls = 0;
  wireHost(receiver, {
    x: () => {
      xCalls++;
    },
    y: () => {
      yCalls++;
    },
  });

  const trigger = el();
  run(trigger, "#m.x().once().y()", new Event("click"));
  run(trigger, "#m.x().once().y()", new Event("click"));
  assert.equal(xCalls, 2, "links before the once run every time");
  assert.equal(yCalls, 1, "links after the once run once ever");
});

test("once() is not refunded when a verb after it throws", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("m");
  let boomCalls = 0;
  wireHost(receiver, {
    boom: () => {
      boomCalls++;
      throw new Error("kaboom");
    },
  });

  const trigger = el();
  run(trigger, "#m.once().boom()", new Event("click"));
  run(trigger, "#m.once().boom()", new Event("click"));
  assert.equal(boomCalls, 1, "the second fire is gated at the once, so the throwing verb never runs again");
  assert.equal(spy.mock.callCount(), 1);
});

test("once() does not cross &&", () => {
  const a = el("a");
  const b = el("b");
  let xCalls = 0;
  let yCalls = 0;
  wireHost(a, { x: () => void xCalls++ });
  wireHost(b, { y: () => void yCalls++ });

  const trigger = el();
  const value = "#a.once().x() && #b.y()";
  run(trigger, value, new Event("click"));
  run(trigger, value, new Event("click"));
  assert.equal(xCalls, 1);
  assert.equal(yCalls, 1, "#b.y() runs whenever the first chain runs; it is not independently once-gated");
});

test("each receiver carries its own debounce", async () => {
  const a = el("a");
  const b = el("b");
  let xCalls = 0;
  let yCalls = 0;
  wireHost(a, { x: () => void xCalls++ });
  wireHost(b, { y: () => void yCalls++ });

  const trigger = el();
  run(trigger, "#a.debounce(20).x() && #b.y()", new Event("click"));
  assert.equal(yCalls, 0, "&& is sequential, so #b.y() waits behind #a's debounce");
  await delay(60);
  assert.equal(xCalls, 1);
  assert.equal(yCalls, 1);
});

test("once() is spent even when the chain aborts after it", () => {
  const receiver = el("m");
  let guardCalls = 0;
  let sendCalls = 0;
  wireHost(receiver, {
    guard: (e) => {
      guardCalls++;
      e.preventDefault();
    },
    send: () => {
      sendCalls++;
    },
  });

  const trigger = el();
  run(trigger, "#m.once().guard().send()", new Event("click"));
  run(trigger, "#m.once().guard().send()", new Event("click"));
  assert.equal(guardCalls, 1, "the second fire is gated at the once, so the guard never runs again");
  assert.equal(sendCalls, 0);
});

test("key prefixes filter events and are case-insensitive", () => {
  const receiver = el("f");
  let sendCalls = 0;
  wireHost(receiver, { send: () => void sendCalls++ });

  const trigger = el();
  run(trigger, "enter: #f.send()", keyEvent("Enter"));
  run(trigger, "enter: #f.send()", keyEvent("ENTER"));
  run(trigger, "enter: #f.send()", keyEvent("Tab"));
  run(trigger, "enter: #f.send()", keyEvent(" "));
  assert.equal(sendCalls, 2);
});

test("a keyed phrase under a non-keyboard event is skipped and logged once", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("f");
  let sendCalls = 0;
  wireHost(receiver, { send: () => void sendCalls++ });

  const trigger = el();
  run(trigger, "enter: #f.send()", new Event("click"));
  run(trigger, "enter: #f.send()", new Event("click"));
  assert.equal(sendCalls, 0);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes('key "enter" on non-keyboard event "click"'));
});

test("this resolves to the element the phrase was read from", () => {
  const trigger = el("me");
  const seen: InteractionEvent[] = [];
  wireHost(trigger, { reset: () => undefined });
  observe(trigger, seen);

  run(trigger, "this.reset()", new Event("keydown"));
  assert.equal(seen.length, 1);
  assert.strictEqual(seen[0]!.source, trigger as unknown as Element);
});

test("a missing receiver fails only its phrase and is logged once per element", (t) => {
  const spy = t.mock.method(console, "error");
  const other = el("other");
  wireHost(other, { show: () => undefined });

  const trigger = el();
  run(trigger, "#ghost.show(); #other.show()", new Event("click"));
  run(trigger, "#ghost.show()", new Event("click"));

  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("receiver #ghost not found"));
});

test("property reads resolve to the platform value at fire time", () => {
  const qty = el("qty");
  qty.valueAsNumber = 5;
  const receiver = el("total");
  const seen: InteractionEvent[] = [];
  wireHost(receiver, { add: () => undefined });
  observe(receiver, seen);

  run(el(), "#total.add(#qty.valueAsNumber)", new Event("click"));
  assert.equal(seen[0]!.arg, 5);

  const trigger = el();
  trigger.value = "abc";
  run(trigger, "#total.add(this.value)", new Event("click"));
  assert.equal(seen[1]!.arg, "abc");
});

test("reading a property the resolved element lacks skips the phrase and is logged", (t) => {
  const spy = t.mock.method(console, "error");
  const panel = el("panel");
  Reflect.deleteProperty(panel, "checked");
  const receiver = el("x");
  let setCalls = 0;
  wireHost(receiver, { set: () => void setCalls++ });

  run(el(), "#x.set(#panel.checked)", new Event("click"));
  assert.equal(setCalls, 0);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("#panel has no checked property"));
});

test("object literal arguments resolve field by field", () => {
  const list = el("list");
  const receiver = el("total");
  const seen: InteractionEvent[] = [];
  wireHost(receiver, { sum: () => undefined });
  observe(receiver, seen);

  run(el(), "#total.sum({root: #list, select: '.amount'})", new Event("click"));
  assert.deepEqual(seen[0]!.arg, { root: list, select: ".amount" });
});

test("the result channel carries the verb's return value", () => {
  const receiver = el("m");
  const seen: InteractionEvent[] = [];
  wireHost(receiver, { total: () => 42 });
  observe(receiver, seen);

  run(el(), "#m.total()", new Event("click"));
  assert.equal(seen[0]!.result, 42);
  assert.equal(seen[0]!.handled, true);
});

test("debounce defers the whole chain and coalesces", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.debounce(20).show()", new Event("click"));
  run(trigger, "#m.debounce(20).show()", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
});

test("throttle runs on the leading edge and drops in-window fires", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.throttle(40).show()", new Event("click"));
  run(trigger, "#m.throttle(40).show()", new Event("click"));
  assert.equal(showCalls, 1);
  await delay(70);
  run(trigger, "#m.throttle(40).show()", new Event("click"));
  assert.equal(showCalls, 2);
});

test("references resolve at fire time, after the debounce", async () => {
  const trigger = el();
  let showCalls = 0;

  run(trigger, "#late.debounce(20).show()", new Event("click"));
  assert.equal(showCalls, 0);

  const late = el("late");
  wireHost(late, { show: () => void showCalls++ });
  await delay(60);
  assert.equal(showCalls, 1);
});

test("once() with a debounce is spent after the debounce fires", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.debounce(20).once().show()", new Event("click"));
  await delay(60);
  run(trigger, "#m.debounce(20).once().show()", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
});

test("clearPhraseState drops pending timers and once state", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.debounce(20).show()", new Event("click"));
  clearPhraseState(trigger as unknown as Element);
  await delay(60);
  assert.equal(showCalls, 0);

  run(trigger, "#m.once().show()", new Event("click"));
  run(trigger, "#m.once().show()", new Event("click"));
  assert.equal(showCalls, 1);
  clearPhraseState(trigger as unknown as Element);
  run(trigger, "#m.once().show()", new Event("click"));
  assert.equal(showCalls, 2);
});

test("an implementation may still set e.pauseMs to defer the rest of the chain", async () => {
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    wait: (e, ms) => {
      order.push("wait");
      e.pauseMs = Number(ms);
    },
    after: () => {
      order.push("after");
    },
  });

  const trigger = el();
  run(trigger, "#m.wait(20).after()", new Event("click"));
  assert.deepEqual(order, ["wait"]);
  await delay(60);
  assert.deepEqual(order, ["wait", "after"]);
});

test("delay() defers the rest of the chain", async () => {
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    after: () => {
      order.push("after");
    },
  });

  const trigger = el();
  run(trigger, "#m.delay(20).after()", new Event("click"));
  assert.deepEqual(order, []);
  await delay(60);
  assert.deepEqual(order, ["after"]);
});

test("delay is mid-chain: links before it run now, links after resume", async () => {
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    first: () => {
      order.push("first");
    },
    last: () => {
      order.push("last");
    },
  });

  const click = new Event("click");
  run(el(), "#m.first().delay(20).last()", click);
  assert.deepEqual(order, ["first"]);
  await delay(60);
  assert.deepEqual(order, ["first", "last"]);
});

test("delay pauses where it sits and && units after it wait", async () => {
  const first = el("first");
  const second = el("second");
  const order: string[] = [];
  wireHost(first, {
    start: () => void order.push("start"),
    end: () => void order.push("end"),
  });
  wireHost(second, { after: () => void order.push("after") });

  run(el(), "#first.start().delay(20).end() && #second.after()", new Event("click"));
  assert.deepEqual(order, ["start"]);
  await delay(60);
  assert.deepEqual(order, ["start", "end", "after"]);
});

test("a resumed verb sees the original event", async () => {
  const receiver = el("m");
  let seenOriginal: Event | undefined;
  wireHost(receiver, {
    show: (e) => {
      seenOriginal = e.originalEvent;
    },
  });

  const click = new Event("click");
  run(el(), "#m.delay(20).show()", click);
  await delay(60);
  assert.strictEqual(seenOriginal, click);
});

test("once() with a delay is spent when the walk passes it", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.delay(20).once().show()", new Event("click"));
  run(trigger, "#m.delay(20).once().show()", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
  run(trigger, "#m.delay(20).once().show()", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
});

test("a second click does not cancel once-gated delayed work", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.once().delay(20).show()", new Event("click"));
  run(trigger, "#m.once().delay(20).show()", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1, "the re-fire is gated before the delay, so the first run's resume survives");
});

test("clearPhraseState cancels a pending delay resume", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.delay(20).show()", new Event("click"));
  clearPhraseState(trigger as unknown as Element);
  await delay(60);
  assert.equal(showCalls, 0);
});

test("a re-fire while a delay is pending cancels the earlier resume", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.delay(30).show()", new Event("click"));
  await delay(10);
  run(trigger, "#m.delay(30).show()", new Event("click"));
  await delay(25);
  assert.equal(showCalls, 0);
  await delay(40);
  assert.equal(showCalls, 1);
});

test("a guard after a delay still stops the chain", async () => {
  const receiver = el("m");
  const order: string[] = [];
  wireHost(receiver, {
    validate: (e) => {
      order.push("validate");
      e.preventDefault();
    },
    send: () => {
      order.push("send");
    },
  });

  run(el(), "#m.delay(20).validate().send()", new Event("submit"));
  await delay(60);
  assert.deepEqual(order, ["validate"]);
});

test("the DSL never touches the original DOM event", () => {
  const receiver = el("m");
  wireHost(receiver, { show: () => undefined });

  const click = new Event("click", { cancelable: true });
  run(el(), "#m.show()", click);
  assert.equal(click.defaultPrevented, false);
});

test("errors are never thrown from the event path", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("m");
  wireHost(receiver, { show: () => undefined });

  assert.doesNotThrow(() => run(el(), "#m.show((", new Event("click")));
  assert.doesNotThrow(() => run(el(), "#ghost.show()", new Event("click")));
  assert.ok(spy.mock.callCount() >= 1);
});

test("|| runs the fallback only when a guard aborts", () => {
  const form = el("form");
  const alert = el("alert");
  const order: string[] = [];
  let valid = false;
  wireHost(form, {
    validate: (e) => {
      order.push("validate");
      if (!valid) e.preventDefault();
    },
    send: () => {
      order.push("send");
    },
  });
  wireHost(alert, {
    show: () => {
      order.push("show");
    },
  });

  const trigger = el();
  run(trigger, "#form.validate().send() || #alert.show()", new Event("submit"));
  assert.deepEqual(order, ["validate", "show"], "an invalid form runs the fallback and not send");

  order.length = 0;
  valid = true;
  run(trigger, "#form.validate().send() || #alert.show()", new Event("submit"));
  assert.deepEqual(order, ["validate", "send"], "a valid form runs send and not the fallback");
});

test("|| stops at the first unit that completes", () => {
  const first = el("first");
  const second = el("second");
  const order: string[] = [];
  wireHost(first, { show: () => void order.push("first") });
  wireHost(second, { show: () => void order.push("second") });

  run(el(), "#first.show() || #second.show()", new Event("click"));
  assert.deepEqual(order, ["first"]);
});

test("&& runs the next unit only when the previous completed", () => {
  const form = el("form");
  const hint = el("hint");
  const order: string[] = [];
  let valid = false;
  wireHost(form, {
    validate: (e) => {
      order.push("validate");
      if (!valid) e.preventDefault();
    },
  });
  wireHost(hint, {
    show: () => {
      order.push("show");
    },
  });

  const trigger = el();
  run(trigger, "#form.validate() && #hint.show()", new Event("submit"));
  assert.deepEqual(order, ["validate"], "an aborted unit stops the remaining && units");

  order.length = 0;
  valid = true;
  run(trigger, "#form.validate() && #hint.show()", new Event("submit"));
  assert.deepEqual(order, ["validate", "show"]);
});

test("a thrown verb stops && and does not trigger ||", (t) => {
  const spy = t.mock.method(console, "error");
  const form = el("form");
  const alert = el("alert");
  const order: string[] = [];
  wireHost(form, {
    validate: () => {
      order.push("validate");
      throw new Error("kaboom");
    },
  });
  wireHost(alert, { show: () => void order.push("show") });

  run(el(), "#form.validate() && #alert.show()", new Event("click"));
  run(el(), "#form.validate() || #alert.show()", new Event("click"));
  assert.deepEqual(order, ["validate", "validate"]);
  assert.equal(spy.mock.callCount(), 2);
});

test("an unowned verb stops && and does not trigger ||", (t) => {
  const spy = t.mock.method(console, "error");
  const form = el("form");
  const alert = el("alert");
  const order: string[] = [];
  wireHost(form, { validate: () => void order.push("validate") });
  wireHost(alert, { show: () => void order.push("show") });

  const trigger = el();
  run(trigger, "#form.validate().send() && #alert.show()", new Event("click"));
  run(trigger, "#form.validate().send() || #alert.show()", new Event("click"));
  assert.deepEqual(order, ["validate", "validate"]);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("no implementation"));
});

test("a missing receiver stops && and does not trigger ||", (t) => {
  const spy = t.mock.method(console, "error");
  const alert = el("alert");
  const order: string[] = [];
  wireHost(alert, { show: () => void order.push("show") });

  const trigger = el();
  run(trigger, "#ghost.show() && #alert.show()", new Event("click"));
  run(trigger, "#ghost.show() || #alert.show()", new Event("click"));
  assert.deepEqual(order, []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("receiver #ghost not found"));
});

test("a failed argument resolution stops && and does not trigger ||", (t) => {
  const spy = t.mock.method(console, "error");
  const panel = el("panel");
  Reflect.deleteProperty(panel, "checked");
  const form = el("form");
  const alert = el("alert");
  const order: string[] = [];
  wireHost(form, { set: () => void order.push("set") });
  wireHost(alert, { show: () => void order.push("show") });

  const trigger = el();
  run(trigger, "#form.set(#panel.checked) && #alert.show()", new Event("click"));
  run(trigger, "#form.set(#panel.checked) || #alert.show()", new Event("click"));
  assert.deepEqual(order, []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("argument for set()"));
});

test("a fallback unit's own once() gates the fallback chain", () => {
  const form = el("form");
  const alert = el("alert");
  let validateCalls = 0;
  let sendCalls = 0;
  let showCalls = 0;
  wireHost(form, {
    validate: (e) => {
      validateCalls++;
      e.preventDefault();
    },
    send: () => void sendCalls++,
  });
  wireHost(alert, { show: () => void showCalls++ });

  const trigger = el();
  const value = "#form.validate().send() || #alert.once().show()";
  run(trigger, value, new Event("submit"));
  run(trigger, value, new Event("submit"));
  assert.equal(validateCalls, 2);
  assert.equal(sendCalls, 0);
  assert.equal(showCalls, 1, "the fallback's own once gates the fallback chain, not the first unit");
});

test("a keyed phrase works with && and ||", () => {
  const form = el("form");
  const alert = el("alert");
  const order: string[] = [];
  wireHost(form, {
    validate: (e) => {
      order.push("validate");
      e.preventDefault();
    },
  });
  wireHost(alert, { show: () => void order.push("show") });

  const trigger = el();
  run(trigger, "enter: #form.validate() || #alert.show()", keyEvent("Enter"));
  assert.deepEqual(order, ["validate", "show"]);

  order.length = 0;
  run(trigger, "enter: #form.validate() || #alert.show()", keyEvent("Tab"));
  assert.deepEqual(order, [], "a non-matching key never reaches the phrase");

  run(trigger, "enter: #form.validate() && #alert.show()", keyEvent("Enter"));
  assert.deepEqual(order, ["validate"], "&& stops after the guard abort");
});

test("an intersect event's key is the margin: only matching phrases run", () => {
  const receiver = el("nav");
  let bumpCalls = 0;
  wireHost(receiver, { bump: () => void bumpCalls++ });

  const trigger = el();
  run(trigger, "0px: #nav.bump()", new ImplementationEvent("intersect-enter", { key: "0px" }));
  assert.equal(bumpCalls, 1);
  run(trigger, "0px: #nav.bump()", new ImplementationEvent("intersect-enter", { key: "10px" }));
  assert.equal(bumpCalls, 1, "a non-matching margin is skipped quietly");
});

test("a keyless intersect phrase only reacts to its 0px observer", () => {
  const receiver = el("nav");
  let bumpCalls = 0;
  wireHost(receiver, { bump: () => void bumpCalls++ });

  const trigger = el();
  const value = "#nav.bump()";
  run(trigger, value, new ImplementationEvent("intersect-full", { key: "0px" }));
  assert.equal(bumpCalls, 1);
  run(trigger, value, new ImplementationEvent("intersect-full", { key: "10px" }));
  assert.equal(bumpCalls, 1, "a keyless phrase matches only the 0px observer");
});

test("a keyed phrase on a non-matching synthetic event is skipped quietly", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("f");
  let sendCalls = 0;
  wireHost(receiver, { send: () => void sendCalls++ });

  const trigger = el();
  run(trigger, "10px: #f.send()", new ImplementationEvent("intersect-half", { key: "0px" }));
  run(trigger, "10px: #f.send()", new ImplementationEvent("intersect-half", { key: "0px" }));
  assert.equal(sendCalls, 0);
  assert.equal(spy.mock.callCount(), 0, "non-matching synthetic keys log nothing");
});

test("an intersect event with a keyed phrase does not fall into the skip-and-log branch", (t) => {
  const spy = t.mock.method(console, "error");
  const receiver = el("f");
  let sendCalls = 0;
  wireHost(receiver, { send: () => void sendCalls++ });

  const trigger = el();
  run(trigger, "10px: #f.send()", new ImplementationEvent("intersect-half", { key: "10px" }));
  assert.equal(sendCalls, 1);
  assert.equal(spy.mock.callCount(), 0);
});

test("keyless phrases on keyless implementation events keep running", () => {
  const receiver = el("copier");
  let copyCalls = 0;
  wireHost(receiver, { flash: () => void copyCalls++ });

  const trigger = el();
  run(trigger, "#copier.flash()", new ImplementationEvent("copy", {}));
  assert.equal(copyCalls, 1, "a keyless on-copy phrase is not gated by the key guard");
});