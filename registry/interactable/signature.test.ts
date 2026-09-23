import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import { compileSignature, exclusive, optionalCtor } from "@interactable/signature.ts";
import type { Ctor } from "@interactable/signature.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

let dom: JSDOM;
let runPhrases: typeof import("@interactable/executor.ts").runPhrases;
let attach: typeof import("@interactable/attachment.ts").attach;

before(async () => {
  dom = setupJsdom();
  ({ runPhrases } = await import("@interactable/executor.ts"));
  ({ attach } = await import("@interactable/attachment.ts"));
  const { defineImplementation } = await import("@behaviors/_implementation-definition.ts");
  defineImplementation("signature-fake", { tags: ["div"], verbs: { set: "string | number" } }, () => ({
    set: () => undefined,
  }));
});

after(() => {
  teardownJsdom(dom);
});

class Widget {
  name = "widget";
}
class Gadget {
  name = "gadget";
}
const WidgetCtor = Widget as unknown as Ctor;

test("string slot validates scalars through tsyntax, no coercion", () => {
  const sig = compileSignature("number | undefined");
  assert.equal(sig.validate(5), 5);
  assert.equal(sig.validate(undefined), undefined);
  assert.throws(() => sig.validate("5"));
  assert.throws(() => sig.validate(true));
});

test("a numeric literal slot accepts only that value", () => {
  const sig = compileSignature("2");
  assert.equal(sig.validate(2), 2);
  assert.throws(() => sig.validate(3));
  assert.throws(() => sig.validate("2"));
});

test("string literal unions are exact, not coerced", () => {
  const sig = compileSignature("'upper' | 'lower'");
  assert.equal(sig.validate("upper"), "upper");
  assert.equal(sig.validate("lower"), "lower");
  assert.throws(() => sig.validate("UPPER"));
  assert.throws(() => sig.validate("upper "));
});

test("'undefined' accepts no argument", () => {
  const sig = compileSignature("undefined");
  assert.equal(sig.validate(undefined), undefined);
  assert.throws(() => sig.validate(null));
  assert.throws(() => sig.validate(0));
});

test("constructor slot validates with instanceof", () => {
  const sig = compileSignature(WidgetCtor);
  assert.ok(sig.validate(new Widget()) instanceof Widget);
  assert.throws(() => sig.validate(new Gadget()));
  assert.throws(() => sig.validate("widget"));
  assert.throws(() => sig.validate(null));
  assert.throws(() => sig.validate(undefined));
});

test("a malformed tsyntax string is rejected at compile time", () => {
  assert.throws(() => compileSignature("banana"));
  assert.throws(() => compileSignature("string |"));
});

test("record slot validates field by field", () => {
  const sig = compileSignature({ root: WidgetCtor, select: "string" });
  const value = sig.validate({ root: new Widget(), select: ".amount" });
  assert.deepEqual(value, { root: new Widget(), select: ".amount" });

  assert.throws(() => sig.validate({ root: new Gadget(), select: ".amount" }));
  assert.throws(() => sig.validate({ root: new Widget() }));
  assert.throws(() => sig.validate({ root: new Widget(), select: 5 }));
  assert.throws(() => sig.validate({ root: new Widget(), select: ".amount", extra: 1 }));
  assert.throws(() => sig.validate("not an object"));
  assert.throws(() => sig.validate([]));
});

test("record slot fields may themselves be records of mixed slots", () => {
  const sig = compileSignature({ root: WidgetCtor, threshold: "number" });
  const value = sig.validate({ root: new Widget(), threshold: 2 }) as { threshold: number };
  assert.equal(value.threshold, 2);
  assert.throws(() => sig.validate({ root: new Widget(), threshold: "2" }));
});

test("the '*' rest key validates every undeclared key and keeps declared keys on their own slots", () => {
  const sig = compileSignature({ count: "number", "*": "string | number | boolean" });
  const value = sig.validate({ count: 2, title: "hi", id: 5 }) as Record<string, unknown>;
  assert.equal(value["count"], 2);
  assert.equal(value["title"], "hi");
  assert.equal(value["id"], 5);
  assert.throws(() => sig.validate({ count: "2", title: "hi" }));
  assert.throws(() => sig.validate({ count: 2, title: { nested: 1 } }));
  assert.throws(() => sig.validate({ count: 2, title: ["array"] }));
  assert.throws(() => sig.validate({ title: "hi" }));
});

test("a record whose fields are all optional may be omitted even with a '*' rest key", () => {
  const sig = compileSignature({ method: "'get' | undefined", "*": "string | number" });
  assert.equal(sig.validate(undefined), undefined);
  assert.deepEqual(sig.validate({ q: "x" }), { q: "x" });
});

test("an optional-Ctor slot may be omitted but instance-checks when present", () => {
  const sig = compileSignature({ template: optionalCtor(WidgetCtor), name: "string" });
  assert.deepEqual(sig.validate({ name: "x" }), { name: "x" });
  const withTemplate = sig.validate({ template: new Widget(), name: "x" }) as {
    template: Widget;
  };
  assert.ok(withTemplate.template instanceof Widget);
  assert.throws(() => sig.validate({ template: new Gadget(), name: "x" }));
  assert.throws(() => sig.validate({ template: "tpl", name: "x" }));
  assert.throws(() => sig.validate({ template: 5, name: "x" }));
});

test("an exclusive slot validates its own scalar and rejects a record naming both partners", () => {
  const sig = compileSignature({
    template: optionalCtor(WidgetCtor),
    payload: exclusive("template", "string | undefined"),
  });
  assert.deepEqual(sig.validate({ payload: "<li>hi</li>" }), { payload: "<li>hi</li>" });
  const withTemplate = sig.validate({ template: new Widget() }) as { template: Widget };
  assert.ok(withTemplate.template instanceof Widget);
  assert.throws(() => sig.validate({ template: new Widget(), payload: "<li>hi</li>" }), /mutually exclusive/);
  assert.throws(() => sig.validate({ payload: 5 }));
  assert.throws(() => sig.validate({ payload: { nested: 1 } }));
});

test("a record whose only fields are an optional Ctor and an exclusive slot is itself optional", () => {
  const sig = compileSignature({
    template: optionalCtor(WidgetCtor),
    payload: exclusive("template", "string | undefined"),
  });
  assert.equal(sig.validate(undefined), undefined);
  assert.throws(() => sig.validate({ template: new Widget(), payload: "<p>x</p>" }));
});

test("exclusive() naming an undeclared key is rejected at compile time", () => {
  assert.throws(() => compileSignature({ payload: exclusive("nope", "string") }), /not a declared key/);
});

test("a record whose only field is an optional Ctor is itself optional", () => {
  const sig = compileSignature({ template: optionalCtor(WidgetCtor) });
  assert.equal(sig.validate(undefined), undefined);
  const withTemplate = sig.validate({ template: new Widget() }) as { template: Widget };
  assert.ok(withTemplate.template instanceof Widget);
});

test("a required Ctor slot stays required", () => {
  const sig = compileSignature({ root: WidgetCtor, select: "string" });
  assert.throws(() => sig.validate({ select: ".x" }));
  assert.throws(() => sig.validate({ root: undefined, select: ".x" }));
});

test("record slot keys whose signature admits undefined may be omitted", () => {
  const sig = compileSignature({ method: "'get' | 'post' | 'delete' | undefined", body: "string | undefined" });
  assert.deepEqual(sig.validate({ method: "post" }), { method: "post" });
  assert.deepEqual(sig.validate({ method: "get", body: "x" }), { method: "get", body: "x" });
  assert.deepEqual(sig.validate({}), {});
  assert.throws(() => sig.validate({ method: "post", body: 5 }));
  assert.throws(() => sig.validate({ method: 5 }));
  assert.throws(() => sig.validate({ unexpected: 1 }));
});

test("a record whose slots are all optional is itself optional", () => {
  const allOptional = compileSignature({ method: "'get' | 'post' | 'delete' | undefined", body: "string | undefined" });
  assert.equal(allOptional.validate(undefined), undefined);

  const someRequired = compileSignature({ title: "string", count: "number | undefined" });
  assert.throws(() => someRequired.validate(undefined));
});

test("record slot keys that do not admit undefined stay required", () => {
  const sig = compileSignature({ title: "string", count: "number | undefined" });
  assert.deepEqual(sig.validate({ title: "hello" }), { title: "hello" });
  assert.throws(() => sig.validate({}));
  assert.throws(() => sig.validate({ count: 1 }));
});

test("the signature validates the resolved value, not the Arg node", () => {
  const receiver = document.createElement("div");
  receiver.id = "m";
  receiver.setAttribute("implements", "signature-fake");
  document.body.appendChild(receiver);
  attach(receiver);

  const seen: InteractionEvent[] = [];
  receiver.addEventListener("interaction", (raw) => seen.push(raw as InteractionEvent));

  const text = document.createElement("input");
  text.value = "abc";
  document.body.appendChild(text);
  attach(text);
  runPhrases(text, "#m.set(this.value)", new Event("input"));
  assert.equal(seen[0]!.handled, true);
  assert.equal(seen[0]!.error, undefined, "an expression resolving to a string passes 'string | number'");

  const box = document.createElement("input");
  box.type = "checkbox";
  document.body.appendChild(box);
  attach(box);
  runPhrases(box, "#m.set(this.checked)", new Event("change"));
  assert.equal(seen[1]!.handled, true);
  assert.ok(seen[1]!.error !== undefined, "an expression resolving to a boolean fails 'string | number'");
  assert.ok(
    String(seen[1]!.error).includes('"string | number"'),
    String(seen[1]!.error),
  );
});