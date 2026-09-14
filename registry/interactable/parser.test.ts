import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { parse } from "@interactable/parser.ts";

function errorsOf(t: TestContext) {
  return t.mock.method(console, "error");
}

test("empty and whitespace-only values parse to no phrases", () => {
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse("   "), []);
});

test("rule 1: parens are mandatory on every verb", () => {
  const [phrase] = parse("#pop.show()");
  assert.ok(phrase);
  assert.equal(phrase.calls.length, 1);
  assert.equal(phrase.calls[0]!.verb, "show");

  assert.deepEqual(parse("#pop.show"), []);
  assert.deepEqual(parse("#pop.show"), []);
});

test("rule 2: receivers are #ids or this; ids may not contain dots", () => {
  const [byId] = parse("#modal.show()");
  assert.ok(byId);
  assert.deepEqual(byId.ref, { kind: "id", id: "modal" });

  const [byThis] = parse("this.reset()");
  assert.ok(byThis);
  assert.deepEqual(byThis.ref, { kind: "this" });

  assert.deepEqual(parse("#a.b"), []);
  const [dotted] = parse("#a.b()");
  assert.ok(dotted);
  assert.deepEqual(dotted.ref, { kind: "id", id: "a" });
  assert.equal(dotted.calls[0]!.verb, "b");
});

test("rule 3: one receiver per phrase; groups and broadcasts are errors", () => {
  assert.equal(parse("#a.hide(); #b.hide()").length, 2);
  assert.deepEqual(parse("#a, #b.hide()"), []);
  assert.deepEqual(parse("(#a, #b).hide()"), []);
  assert.deepEqual(parse("(#a, #b).hide()"), []);
});

test("rule 4: keys are one per phrase; comma lists are errors", () => {
  const [keyed] = parse("enter: #f.send()");
  assert.ok(keyed);
  assert.equal(keyed.key, "enter");
  assert.deepEqual(keyed.ref, { kind: "id", id: "f" });

  const two = parse("enter: #f.send(); numpadenter: #f.send()");
  assert.equal(two.length, 2);
  assert.equal(two[0]!.key, "enter");
  assert.equal(two[1]!.key, "numpadenter");

  assert.deepEqual(parse("enter, escape: #f.send()"), []);
  assert.deepEqual(parse("enter: escape: #f.send()"), []);
});

test("rule 5: modifiers trail and apply to the whole phrase", () => {
  const [once] = parse("#tour.show().once()");
  assert.ok(once);
  assert.deepEqual(once.modifiers, [{ kind: "once" }]);

  const [filtered] = parse("#results.filter(this.value).debounce(300)");
  assert.ok(filtered);
  assert.equal(filtered.calls.length, 1);
  assert.equal(filtered.calls[0]!.verb, "filter");
  assert.deepEqual(filtered.modifiers, [{ kind: "debounce", ms: 300 }]);

  const [throttled] = parse("#pb.hide().throttle(16).once()");
  assert.ok(throttled);
  assert.deepEqual(throttled.modifiers, [{ kind: "throttle", ms: 16 }, { kind: "once" }]);

  assert.deepEqual(parse("#a.debounce(300).show()"), []);
  assert.deepEqual(parse("#a.debounce(abc).show()"), []);
});

test("rule 9: a verb takes one argument; two positional arguments are an error", () => {
  assert.deepEqual(parse("#total.sum(#list, '.amount')"), []);

  const [obj] = parse("#total.sum({root: #list, select: '.amount'})");
  assert.ok(obj);
  assert.equal(obj.calls[0]!.verb, "sum");
  assert.deepEqual(obj.calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "root", value: { kind: "ref", ref: { kind: "id", id: "list" } } },
      { name: "select", value: { kind: "string", value: ".amount" } },
    ],
  });
});

test("rule 10: argument kinds - number, string, boolean, ref, this, read, object", () => {
  assert.deepEqual(parse("#x.set(5)")[0]!.calls[0]!.arg, { kind: "number", value: 5 });
  assert.deepEqual(parse("#x.set(-2.5)")[0]!.calls[0]!.arg, { kind: "number", value: -2.5 });
  assert.deepEqual(parse("#x.transform('upper')")[0]!.calls[0]!.arg, { kind: "string", value: "upper" });
  assert.deepEqual(parse("#x.set(true)")[0]!.calls[0]!.arg, { kind: "boolean", value: true });
  assert.deepEqual(parse("#x.set(false)")[0]!.calls[0]!.arg, { kind: "boolean", value: false });
  assert.deepEqual(parse("#list.removeRow(this)")[0]!.calls[0]!.arg, { kind: "ref", ref: { kind: "this" } });
  assert.deepEqual(parse("#list.removeRow(#row3)")[0]!.calls[0]!.arg, {
    kind: "ref",
    ref: { kind: "id", id: "row3" },
  });
  assert.deepEqual(parse("#x.set(this.value)")[0]!.calls[0]!.arg, {
    kind: "read",
    ref: { kind: "this" },
    property: "value",
  });
  assert.deepEqual(parse("#note.transform({mode: 'upper', shift: 2})")[0]!.calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "mode", value: { kind: "string", value: "upper" } },
      { name: "shift", value: { kind: "number", value: 2 } },
    ],
  });
  assert.deepEqual(parse("#x.set(qty * 2)"), []);
});

test("rule 11: only value, checked, valueAsNumber may be read off a ref", () => {
  assert.deepEqual(parse("#total.add(#qty.valueAsNumber)")[0]!.calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "qty" },
    property: "valueAsNumber",
  });
  assert.deepEqual(parse("#x.set(#agree.checked)")[0]!.calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "agree" },
    property: "checked",
  });

  assert.deepEqual(parse("set(this.parentElement)"), []);
  assert.deepEqual(parse("this.value"), []);
  assert.deepEqual(parse("#a.value.set(1)"), []);
});

test("rule 12: selectors appear only inside string arguments", () => {
  const [phrase] = parse("#total.sum({root: #list, select: '.amount'})");
  assert.ok(phrase);
  const arg = phrase.calls[0]!.arg;
  assert.equal(arg!.kind, "object");
});

test("rule 13: errors are local - one bad phrase skips only that phrase", () => {
  const phrases = parse("#a, #b.hide(); #c.show()");
  assert.equal(phrases.length, 1);
  assert.deepEqual(phrases[0]!.ref, { kind: "id", id: "c" });
});

test("rule 13: grammar errors are logged once per attribute string", (t) => {
  const spy = errorsOf(t);
  parse("#fresh, #other.hide()");
  parse("#fresh, #other.hide()");
  assert.equal(spy.mock.callCount(), 1);
});

test("rule 14: one verb per call, one call per link", () => {
  const [phrase] = parse("#a.show().hide()");
  assert.ok(phrase);
  assert.deepEqual(phrase.calls.map((c) => c.verb), ["show", "hide"]);

  assert.deepEqual(parse("#a.show()hide()"), []);
});

test("chains link calls with dots", () => {
  const [phrase] = parse("#pop.show().focus()");
  assert.ok(phrase);
  assert.deepEqual(phrase.calls.map((c) => c.verb), ["show", "focus"]);
});

test("whitespace is insignificant outside string literals", () => {
  const [phrase] = parse("  #pop . show ( )  . once ( )  ");
  assert.ok(phrase);
  assert.equal(phrase.calls[0]!.verb, "show");
  assert.equal(phrase.calls[0]!.arg, undefined);
  assert.deepEqual(phrase.modifiers, [{ kind: "once" }]);

  const [stringy] = parse("#x.set( 'a b' )");
  assert.ok(stringy);
  assert.deepEqual(stringy.calls[0]!.arg, { kind: "string", value: "a b" });
});

test("semicolons and commas inside string arguments do not split", () => {
  const phrases = parse("#a.set('x;y'); #b.set('p,q')");
  assert.equal(phrases.length, 2);
  assert.deepEqual(phrases[0]!.calls[0]!.arg, { kind: "string", value: "x;y" });
  assert.deepEqual(phrases[1]!.calls[0]!.arg, { kind: "string", value: "p,q" });
});

test("empty object literals are rejected", () => {
  assert.deepEqual(parse("#a.sum({})"), []);
});

test("parse results are cached by attribute string", () => {
  const first = parse("#pop.show()");
  const second = parse("#pop.show()");
  assert.strictEqual(first, second);
  const other = parse("#pop.show().focus()");
  assert.notStrictEqual(other, first);
});

test("&& and || separate top-level units", () => {
  const [and] = parse("#a.show() && #b.hide()");
  assert.ok(and);
  assert.equal(and.operator, "&&");
  assert.deepEqual(and.ref, { kind: "id", id: "a" });
  assert.deepEqual(and.calls, [{ verb: "show" }]);
  assert.deepEqual(and.rest, [{ ref: { kind: "id", id: "b" }, calls: [{ verb: "hide" }] }]);

  const [or] = parse("#f.validate().send() || #alert.show()");
  assert.ok(or);
  assert.equal(or.operator, "||");
  assert.deepEqual(or.ref, { kind: "id", id: "f" });
  assert.deepEqual(or.calls.map((c) => c.verb), ["validate", "send"]);
  assert.deepEqual(or.rest, [{ ref: { kind: "id", id: "alert" }, calls: [{ verb: "show" }] }]);

  const [single] = parse("#a.show()");
  assert.ok(single);
  assert.equal(single.operator, undefined);
  assert.equal(single.rest, undefined);
});

test("operators may switch receivers and accept this", () => {
  const [phrase] = parse("this.validate().send() || #alert.show()");
  assert.ok(phrase);
  assert.equal(phrase.operator, "||");
  assert.deepEqual(phrase.ref, { kind: "this" });
  assert.deepEqual(phrase.rest, [{ ref: { kind: "id", id: "alert" }, calls: [{ verb: "show" }] }]);
});

test("operators are not recognized inside strings or argument parens/braces", () => {
  const [stringy] = parse("#x.set('a && b')");
  assert.ok(stringy);
  assert.equal(stringy.operator, undefined);
  assert.deepEqual(stringy.calls[0]!.arg, { kind: "string", value: "a && b" });

  const [objecty] = parse("#total.sum({root: #list, select: '.amount || qty'})");
  assert.ok(objecty);
  assert.equal(objecty.operator, undefined);
  assert.deepEqual(objecty.calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "root", value: { kind: "ref", ref: { kind: "id", id: "list" } } },
      { name: "select", value: { kind: "string", value: ".amount || qty" } },
    ],
  });
});

test("mixing && and || in one phrase is a parse error", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#a.show() && #b.hide() || #c.show()"), []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("cannot mix && and ||"));
});

test("modifiers stay phrase-wide across units", () => {
  const [phrase] = parse("#a.validate().send() || #alert.show().once()");
  assert.ok(phrase);
  assert.deepEqual(phrase.modifiers, [{ kind: "once" }]);
  assert.deepEqual(phrase.rest, [{ ref: { kind: "id", id: "alert" }, calls: [{ verb: "show" }] }]);
});