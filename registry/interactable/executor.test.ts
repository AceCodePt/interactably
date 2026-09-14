import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { clearPhraseState, runPhrases } from "@interactable/executor.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";

class FakeElement extends EventTarget {
  id: string;
  value = "";
  checked = false;
  valueAsNumber = NaN;

  constructor(id = "") {
    super();
    this.id = id;
  }
}

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
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("no implementation on <element#m> handles missing()"));
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

test("once() is consumed only when the whole chain completes", () => {
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
  run(trigger, "#m.show().focus().once()", new Event("click"));
  run(trigger, "#m.show().focus().once()", new Event("click"));
  assert.equal(showCalls, 1);
  assert.equal(focusCalls, 1);
});

test("once() is not consumed when the chain aborts", () => {
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
  run(trigger, "#m.guard().send().once()", new Event("click"));
  run(trigger, "#m.guard().send().once()", new Event("click"));
  assert.equal(guardCalls, 2);
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

test("debounce defers the whole phrase and coalesces", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.show().debounce(20)", new Event("click"));
  run(trigger, "#m.show().debounce(20)", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
});

test("throttle runs on the leading edge and drops in-window fires", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.show().throttle(40)", new Event("click"));
  run(trigger, "#m.show().throttle(40)", new Event("click"));
  assert.equal(showCalls, 1);
  await delay(70);
  run(trigger, "#m.show().throttle(40)", new Event("click"));
  assert.equal(showCalls, 2);
});

test("references resolve at fire time, after the debounce", async () => {
  const trigger = el();
  let showCalls = 0;

  run(trigger, "#late.show().debounce(20)", new Event("click"));
  assert.equal(showCalls, 0);

  const late = el("late");
  wireHost(late, { show: () => void showCalls++ });
  await delay(60);
  assert.equal(showCalls, 1);
});

test("once() with a debounce is spent after the debounced completion", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.show().once().debounce(20)", new Event("click"));
  await delay(60);
  run(trigger, "#m.show().once().debounce(20)", new Event("click"));
  await delay(60);
  assert.equal(showCalls, 1);
});

test("clearPhraseState drops pending timers and once state", async () => {
  const receiver = el("m");
  let showCalls = 0;
  wireHost(receiver, { show: () => void showCalls++ });

  const trigger = el();
  run(trigger, "#m.show().debounce(20)", new Event("click"));
  clearPhraseState(trigger as unknown as Element);
  await delay(60);
  assert.equal(showCalls, 0);

  run(trigger, "#m.show().once()", new Event("click"));
  run(trigger, "#m.show().once()", new Event("click"));
  assert.equal(showCalls, 1);
  clearPhraseState(trigger as unknown as Element);
  run(trigger, "#m.show().once()", new Event("click"));
  assert.equal(showCalls, 2);
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