import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { parse, parseEventValue, parseEventValueWithErrors, parseWithErrors } from "@interactable/parser.ts";
import type { Phrase, Unit } from "@interactable/parser.ts";

function errorsOf(t: TestContext) {
  return t.mock.method(console, "error");
}

function first(phrase: Phrase): Unit {
  return phrase.units[0]!;
}

test("empty and whitespace-only values parse to no phrases", () => {
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse("   "), []);
});

test("rule 1: parens are mandatory on every verb", () => {
  const [phrase] = parse("#pop.show()");
  assert.ok(phrase);
  assert.equal(first(phrase).calls.length, 1);
  assert.equal(first(phrase).calls[0]!.verb, "show");

  assert.deepEqual(parse("#pop.show"), []);
  assert.deepEqual(parse("#pop.show"), []);
});

test("rule 2: receivers are #ids or this; ids may not contain dots", () => {
  const [byId] = parse("#modal.show()");
  assert.ok(byId);
  assert.deepEqual(first(byId).ref, { kind: "id", id: "modal" });

  const [byThis] = parse("this.reset()");
  assert.ok(byThis);
  assert.deepEqual(first(byThis).ref, { kind: "this" });

  assert.deepEqual(parse("#a.b"), []);
  const [dotted] = parse("#a.b()");
  assert.ok(dotted);
  assert.deepEqual(first(dotted).ref, { kind: "id", id: "a" });
  assert.equal(first(dotted).calls[0]!.verb, "b");
});

test("an id may not contain the phrase punctuation : & | { } ' \" #", (t) => {
  const spy = errorsOf(t);
  for (const ch of [":", "&", "|", "{", "}", "'", '"', "#"]) {
    assert.deepEqual(parse(`#x.set(#a${ch}b)`), [], `id "a${ch}b" is not addressable`);
  }
  assert.equal(spy.mock.callCount(), 8);
  for (let i = 0; i < 8; i++) {
    assert.ok(String(spy.mock.calls[i]!.arguments[0]).includes("may not contain"));
  }
});

test("the id error names the full ref and the excluded characters", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#x.set(#q:b)"), []);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      'invalid id "q:b" in #q:b; ids used in phrases may not contain : & | { } \' " #',
    ),
  );
});

test("a top-level key prefix is a grammar error naming the parameter form", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse(`${"enter"}: #f.send()`), []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      `phrase keys are not supported; filter with a handler parameter, e.g. "({ name: type }) => { … }"`,
    ),
  );
});

test("rule 3: one receiver per phrase; groups and broadcasts are errors", () => {
  assert.equal(parse("#a.hide(); #b.hide()").length, 2);
  assert.deepEqual(parse("#a, #b.hide()"), []);
  assert.deepEqual(parse("(#a, #b).hide()"), []);
  assert.deepEqual(parse("(#a, #b).hide()"), []);
});

test("rule 5: modifiers sit in the chain with their position recorded", () => {
  const [once] = parse("#tour.once().show()");
  assert.ok(once);
  assert.deepEqual(first(once).modifiers, [{ kind: "once", position: 0 }]);

  const [filtered] = parse("#results.debounce(300).filter(this.value)");
  assert.ok(filtered);
  assert.equal(first(filtered).calls.length, 1);
  assert.equal(first(filtered).calls[0]!.verb, "filter");
  assert.deepEqual(first(filtered).modifiers, [{ kind: "debounce", ms: 300, position: 0 }]);

  const [throttled] = parse("#viewport.throttle(16).zoom(this)");
  assert.ok(throttled);
  assert.deepEqual(first(throttled).modifiers, [{ kind: "throttle", ms: 16, position: 0 }]);

  const [mid] = parse("#a.x().once().y()");
  assert.ok(mid);
  assert.deepEqual(first(mid).modifiers, [{ kind: "once", position: 1 }]);
});

test("once() and delay() stack and repeat freely", () => {
  const [stacked] = parse("#a.debounce(300).once().x()");
  assert.ok(stacked);
  assert.deepEqual(first(stacked).modifiers, [
    { kind: "debounce", ms: 300, position: 0 },
    { kind: "once", position: 0 },
  ]);

  const [interleaved] = parse("#a.x().once().y().delay(50).z()");
  assert.ok(interleaved);
  assert.deepEqual(first(interleaved).modifiers, [
    { kind: "once", position: 1 },
    { kind: "delay", ms: 50, position: 2 },
  ]);
});

test("only one debounce()/throttle() timing modifier per receiver chain", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#a.debounce(300).throttle(16).x()"), []);
  assert.deepEqual(parse("#a.throttle(16).debounce(300).x()"), []);
  assert.deepEqual(parse("#a.debounce(1).debounce(2).x()"), []);
  assert.equal(spy.mock.callCount(), 3);
  for (let i = 0; i < 3; i++) {
    assert.ok(String(spy.mock.calls[i]!.arguments[0]).includes("only one of debounce()/throttle()"));
  }
});

test("each receiver chain in a phrase may carry its own timing modifier", () => {
  const [phrase] = parse("#a.debounce(1).x() && #b.throttle(2).y()");
  assert.ok(phrase);
  assert.equal(phrase.operator, "&&");
  assert.deepEqual(phrase.units[0]!.modifiers, [{ kind: "debounce", ms: 1, position: 0 }]);
  assert.deepEqual(phrase.units[1]!.modifiers, [{ kind: "throttle", ms: 2, position: 0 }]);
});

test("a trailing modifier on a non-last unit is rejected; it never governs the next receiver", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#a.x().once() && #b.y()"), []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("once()"));
});

test("debounce/throttle must come right after the receiver, before any call", () => {
  assert.deepEqual(parse("#a.show().debounce(300)"), []);
  assert.deepEqual(parse("#a.show().throttle(16)"), []);
  assert.deepEqual(parse("#a.once().x().debounce(300)"), []);
  assert.deepEqual(parse("#a.show().once().debounce(300)"), []);
});

test("once() must be followed by a verb call in the same chain", (t) => {
  const spy = errorsOf(t);

  assert.deepEqual(parse("#a.x().once()"), []);
  assert.deepEqual(parse("#a.x().once().delay(500)"), []);

  const [leading] = parse("#a.once().x()");
  assert.ok(leading);
  assert.deepEqual(first(leading).modifiers, [{ kind: "once", position: 0 }]);

  const [mid] = parse("#a.x().once().y()");
  assert.ok(mid);
  assert.deepEqual(first(mid).modifiers, [{ kind: "once", position: 1 }]);

  const [delayed] = parse("#a.x().delay(500)");
  assert.ok(delayed);
  assert.deepEqual(first(delayed).modifiers, [{ kind: "delay", ms: 500, position: 1 }]);

  assert.equal(spy.mock.callCount(), 2);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("once()"));
  assert.ok(String(spy.mock.calls[1]!.arguments[0]).includes("once()"));
});

test("a trailing once() skips only its phrase; the rest of the value runs", (t) => {
  const spy = errorsOf(t);
  const phrases = parse("#a.x().once() && #b.y(); #c.z()");
  assert.equal(phrases.length, 1);
  assert.deepEqual(first(phrases[0]!).ref, { kind: "id", id: "c" });
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("once()"));
});

test("rule 9: a verb takes one argument; two positional arguments are an error", () => {
  assert.deepEqual(parse("#total.sum(#list, '.amount')"), []);

  const [obj] = parse("#total.sum({root: #list, select: '.amount'})");
  assert.ok(obj);
  assert.equal(first(obj).calls[0]!.verb, "sum");
  assert.deepEqual(first(obj).calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "root", value: { kind: "ref", ref: { kind: "id", id: "list" } } },
      { name: "select", value: { kind: "string", value: ".amount" } },
    ],
  });
});

test("rule 10: argument kinds - number, string, boolean, ref, this, read, object", () => {
  assert.deepEqual(first(parse("#x.set(5)")[0]!).calls[0]!.arg, { kind: "number", value: 5 });
  assert.deepEqual(first(parse("#x.set(-2.5)")[0]!).calls[0]!.arg, { kind: "number", value: -2.5 });
  assert.deepEqual(first(parse("#x.transform('upper')")[0]!).calls[0]!.arg, { kind: "string", value: "upper" });
  assert.deepEqual(first(parse("#x.set(true)")[0]!).calls[0]!.arg, { kind: "boolean", value: true });
  assert.deepEqual(first(parse("#x.set(false)")[0]!).calls[0]!.arg, { kind: "boolean", value: false });
  assert.deepEqual(first(parse("#list.removeRow(this)")[0]!).calls[0]!.arg, { kind: "ref", ref: { kind: "this" } });
  assert.deepEqual(first(parse("#list.removeRow(#row3)")[0]!).calls[0]!.arg, {
    kind: "ref",
    ref: { kind: "id", id: "row3" },
  });
  assert.deepEqual(first(parse("#x.set(this.value)")[0]!).calls[0]!.arg, {
    kind: "read",
    ref: { kind: "this" },
    property: "value",
  });
  assert.deepEqual(first(parse("#note.transform({mode: 'upper', shift: 2})")[0]!).calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "mode", value: { kind: "string", value: "upper" } },
      { name: "shift", value: { kind: "number", value: 2 } },
    ],
  });
  assert.deepEqual(parse("#x.set(qty * 2)"), []);
});

test("rule 10: an argument falls through to an expression for operators, calls and .height/.width reads", () => {
  assert.deepEqual(first(parse("#x.set(#qty.value * 2)")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "#qty.value * 2",
    position: 0,
  });
  assert.deepEqual(first(parse("#total.set(sum('#list .amount'))")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "sum('#list .amount')",
    position: 0,
  });
  assert.deepEqual(first(parse("#total.set(#qty.value + #price.value)")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "#qty.value + #price.value",
    position: 0,
  });
  assert.deepEqual(first(parse("#nav.set(#top.height)")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "#top.height",
    position: 0,
  });
  assert.deepEqual(first(parse("#nav.set(this.width)")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "this.width",
    position: 0,
  });
});

test("rule 10: an object literal field may be an expression", () => {
  assert.deepEqual(first(parse("#x.set({name: 'value', value: this.value + '!'})")[0]!).calls[0]!.arg, {
    kind: "object",
    fields: [
      { name: "name", value: { kind: "string", value: "value" } },
      { name: "value", value: { kind: "expr", source: "this.value + '!'", position: 22 } },
    ],
  });
});

test("rule 11: value, checked, min, max and step may be read off a ref; valueAsNumber is a parse error", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(first(parse("#x.set(#agree.checked)")[0]!).calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "agree" },
    property: "checked",
  });
  assert.deepEqual(first(parse("#x.set(#q.min)")[0]!).calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "q" },
    property: "min",
  });
  assert.deepEqual(first(parse("#x.set(#q.max)")[0]!).calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "q" },
    property: "max",
  });
  assert.deepEqual(first(parse("#x.set(#q.step)")[0]!).calls[0]!.arg, {
    kind: "read",
    ref: { kind: "id", id: "q" },
    property: "step",
  });

  assert.deepEqual(parse("#total.add(#qty.valueAsNumber)"), []);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      ".valueAsNumber is not a property; .value on a number input is already a number",
    ),
  );

  assert.deepEqual(parse("set(this.parentElement)"), []);
  assert.deepEqual(parse("this.value"), []);
  assert.deepEqual(parse("#a.value.set(1)"), []);
});

test("rule 12: selectors appear only inside string arguments", () => {
  const [phrase] = parse("#total.sum({root: #list, select: '.amount'})");
  assert.ok(phrase);
  const arg = first(phrase).calls[0]!.arg;
  assert.equal(arg!.kind, "object");
});

test("rule 13: errors are local - one bad phrase skips only that phrase", () => {
  const phrases = parse("#a, #b.hide(); #c.show()");
  assert.equal(phrases.length, 1);
  assert.deepEqual(first(phrases[0]!).ref, { kind: "id", id: "c" });
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
  assert.deepEqual(first(phrase).calls.map((c) => c.verb), ["show", "hide"]);

  assert.deepEqual(parse("#a.show()hide()"), []);
});

test("chains link calls with dots", () => {
  const [phrase] = parse("#pop.show().focus()");
  assert.ok(phrase);
  assert.deepEqual(first(phrase).calls.map((c) => c.verb), ["show", "focus"]);
});

test("whitespace is insignificant outside string literals", () => {
  const [phrase] = parse("  #pop . show ( )  . once ( )  . focus()  ");
  assert.ok(phrase);
  assert.deepEqual(first(phrase).calls.map((c) => c.verb), ["show", "focus"]);
  assert.deepEqual(first(phrase).modifiers, [{ kind: "once", position: 1 }]);

  const [stringy] = parse("#x.set( 'a b' )");
  assert.ok(stringy);
  assert.deepEqual(first(stringy).calls[0]!.arg, { kind: "string", value: "a b" });
});

test("semicolons and commas inside string arguments do not split", () => {
  const phrases = parse("#a.set('x;y'); #b.set('p,q')");
  assert.equal(phrases.length, 2);
  assert.deepEqual(first(phrases[0]!).calls[0]!.arg, { kind: "string", value: "x;y" });
  assert.deepEqual(first(phrases[1]!).calls[0]!.arg, { kind: "string", value: "p,q" });
});

test("empty object literals are rejected", () => {
  assert.deepEqual(parse("#a.sum({})"), []);
});

test("parse results are cached by attribute string", () => {
  const firstParse = parse("#pop.show()");
  const second = parse("#pop.show()");
  assert.strictEqual(firstParse, second);
  const other = parse("#pop.show().focus()");
  assert.notStrictEqual(other, firstParse);
});

test("intersect parses a plain body and rejects a key prefix", (t) => {
  const spy = errorsOf(t);
  const [phrase] = parse("#nav.bump()");
  assert.ok(phrase);
  assert.equal(first(phrase).calls[0]!.verb, "bump");

  assert.deepEqual(parse(`${"enter"}: #a.show()`), []);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes(
      `phrase keys are not supported; filter with a handler parameter, e.g. "({ name: type }) => { … }"`,
    ),
  );
});

test("parseEventValue: one unbracketed handler with an empty parameter", () => {
  const [ok] = parseEventValue("() => { #f.send() }");
  assert.ok(ok);
  assert.deepEqual(ok.parameter.fields, []);
  assert.equal(ok.phrases.length, 1);
});

test("parseEventValue: typed and literal parameter fields mix in one handler", () => {
  const [handler] = parseEventValue(
    "({status: 200, html: string, key: 'Enter', full: true}) => { #r.set(html) }",
  );
  assert.ok(handler);
  assert.deepEqual(
    handler.parameter.fields.map((field) => ({ name: field.name, kind: field.kind })),
    [
      { name: "status", kind: "literal" },
      { name: "html", kind: "type" },
      { name: "key", kind: "literal" },
      { name: "full", kind: "literal" },
    ],
  );
  const [status, html, key, full] = handler.parameter.fields;
  assert.deepEqual(status, { kind: "literal", name: "status", value: 200 });
  assert.deepEqual(html, { kind: "type", name: "html", type: "string" });
  assert.deepEqual(key, { kind: "literal", name: "key", value: "Enter" });
  assert.deepEqual(full, { kind: "literal", name: "full", value: true });
});

test("parseEventValue: a bracketed list holds several handlers, and [] is legal", () => {
  const handlers = parseEventValue(
    "[({status: 200}) => { #a.go() }, ({status: 409}) => { #b.go() }]",
  );
  assert.equal(handlers.length, 2);
  const empty = parseEventValue("[]");
  assert.deepEqual(empty, []);
});

test("parseEventValue: a single handler may not be followed by a comma", () => {
  const { handlers, errors } = parseEventValueWithErrors("() => { #a.go() }, () => { #b.go() }");
  assert.equal(handlers.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /need brackets/);
});

test("parseEventValue: a separating comma is only legal after a body at depth zero", () => {
  const { errors } = parseEventValueWithErrors(
    "[() => { #a.go() }, ({n: number}) => { #b.go(n) }]",
  );
  assert.deepEqual(errors, []);
});

test("parseEventValue: concise bodies are a grammar error naming the braced form", () => {
  const { handlers, errors } = parseEventValueWithErrors("({key: 'Enter'}) => #f.send()");
  assert.deepEqual(handlers, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /braced/);
  assert.match(errors[0]!.message, /\{ #f\.send\(\) \}/);
});

test("parseEventValue: a backticked literal is a grammar error naming single quotes", () => {
  const { handlers, errors } = parseEventValueWithErrors("({key: `Enter`}) => { #f.send() }");
  assert.deepEqual(handlers, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /backticked literals are not supported/);
  assert.match(errors[0]!.message, /single quotes/);
});

test("parseEventValue: parameters must be () or a parenthesised object", () => {
  assert.match(
    parseEventValueWithErrors("({html: string) => { #a.go() }").errors[0]!.message,
    /parameter must be/,
  );
  assert.match(
    parseEventValueWithErrors("(html) => { #a.go() }").errors[0]!.message,
    /parameter must be/,
  );
  assert.match(
    parseEventValueWithErrors("({}) => { #a.go() }").errors[0]!.message,
    /empty parameter object/,
  );
});

test("parseEventValue: body phrase spans are value-relative", () => {
  const value = "({html: string}) => { #r.set(html) }";
  const [handler] = parseEventValue(value);
  assert.ok(handler);
  const phrase = handler.phrases[0]!;
  assert.equal(value.slice(phrase.start, phrase.end), "#r.set(html)");
  const call = phrase.units[0]!.calls[0]!;
  assert.equal(value.slice(call.start, call.end), "set(html)");
});

test("parseEventValue: body errors are value-relative", () => {
  const value = "() => { #r.set( }";
  const { errors } = parseEventValueWithErrors(value);
  assert.equal(errors.length, 1);
  assert.equal(value.slice(errors[0]!.start, errors[0]!.end), "set(");
});

test("parseEventValue: a handler needs an arrow and a braced body", () => {
  assert.equal(parseEventValue("").length, 0);
  assert.match(parseEventValueWithErrors("#a()").errors[0]!.message, /expected a handler/);
  assert.match(parseEventValueWithErrors("() => { #a()").errors[0]!.message, /braced/);
});

test("parseEventValue: the task's after examples parse", () => {
  for (const value of [
    "({key: 'Enter'}) => { #f.send() }",
    "({html: string}) => { #receipt.set(html) }",
    "[({status: 200, html: string}) => { #receipt.render({payload: html}) }, ({status: 409}) => { #email-taken.show() }]",
  ]) {
    const { handlers, errors } = parseEventValueWithErrors(value);
    assert.deepEqual(errors, [], value);
    assert.equal(handlers.length, value.startsWith("[") ? 2 : 1);
  }
});

test("a bare identifier parses as a name argument, not an expression", () => {
  const [phrase] = parse("#x.set(html)");
  assert.ok(phrase);
  assert.deepEqual(first(phrase).calls[0]!.arg, { kind: "name", name: "html" });
  assert.deepEqual(first(parse("#x.set(text)")[0]!).calls[0]!.arg, { kind: "name", name: "text" });
});

test("a bare identifier resolves as an object-field value", () => {
  const [phrase] = parse("#x.render({body: html})");
  assert.ok(phrase);
  assert.deepEqual(first(phrase).calls[0]!.arg, {
    kind: "object",
    fields: [{ name: "body", value: { kind: "name", name: "html" } }],
  });
});

test("a bare identifier inside an expression stays an expression parse error", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#x.set(replace(html, 'a', ''))"), []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("unknown token"));
});

test("&& and || separate top-level units", () => {
  const [and] = parse("#a.show() && #b.hide()");
  assert.ok(and);
  assert.equal(and.operator, "&&");
  assert.deepEqual(and.units, [
    { ref: { kind: "id", id: "a" }, calls: [{ verb: "show" }], modifiers: [] },
    { ref: { kind: "id", id: "b" }, calls: [{ verb: "hide" }], modifiers: [] },
  ]);

  const [or] = parse("#f.validate().send() || #alert.show()");
  assert.ok(or);
  assert.equal(or.operator, "||");
  assert.deepEqual(or.units[0]!.calls.map((c) => c.verb), ["validate", "send"]);
  assert.deepEqual(or.units[1]!, {
    ref: { kind: "id", id: "alert" },
    calls: [{ verb: "show" }],
    modifiers: [],
  });

  const [single] = parse("#a.show()");
  assert.ok(single);
  assert.equal(single.operator, undefined);
  assert.equal(single.units.length, 1);
});

test("operators may switch receivers and accept this", () => {
  const [phrase] = parse("this.validate().send() || #alert.show()");
  assert.ok(phrase);
  assert.equal(phrase.operator, "||");
  assert.deepEqual(phrase.units[0]!.ref, { kind: "this" });
  assert.deepEqual(phrase.units[1]!, {
    ref: { kind: "id", id: "alert" },
    calls: [{ verb: "show" }],
    modifiers: [],
  });
});

test("operators are not recognized inside strings or argument parens/braces", () => {
  const [stringy] = parse("#x.set('a && b')");
  assert.ok(stringy);
  assert.equal(stringy.operator, undefined);
  assert.deepEqual(first(stringy).calls[0]!.arg, { kind: "string", value: "a && b" });

  const [objecty] = parse("#total.sum({root: #list, select: '.amount || qty'})");
  assert.ok(objecty);
  assert.equal(objecty.operator, undefined);
  assert.deepEqual(first(objecty).calls[0]!.arg, {
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

test("each unit carries its own modifiers, and no modifier crosses &&", () => {
  const [phrase] = parse("#a.once().validate().send() || #alert.show().once().focus()");
  assert.ok(phrase);
  assert.deepEqual(phrase.units[0]!.modifiers, [{ kind: "once", position: 0 }]);
  assert.deepEqual(phrase.units[1]!.modifiers, [{ kind: "once", position: 1 }]);
});

test("delay is a modifier: it parses in any position, not just the end", () => {
  const [leading] = parse("#a.delay(300).x()");
  assert.ok(leading);
  assert.deepEqual(first(leading).modifiers, [{ kind: "delay", ms: 300, position: 0 }]);

  const [mid] = parse("#a.copy().delay(1500).reset()");
  assert.ok(mid);
  assert.deepEqual(first(mid).modifiers, [{ kind: "delay", ms: 1500, position: 1 }]);

  assert.deepEqual(parse("#a.delay(abc).x()"), []);
});

test("a verb still takes one argument: nested commas inside a call are one argument", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#x.set(1, 2)"), []);
  assert.equal(spy.mock.callCount(), 1);
  assert.ok(String(spy.mock.calls[0]!.arguments[0]).includes("takes one argument"));

  const [nested] = parse("#total.set(min(1, 2))");
  assert.ok(nested);
  assert.deepEqual(first(nested).calls[0]!.arg, { kind: "expr", source: "min(1, 2)", position: 0 });
});

test("a malformed expression is a parse-time error naming the position", (t) => {
  const spy = errorsOf(t);
  assert.deepEqual(parse("#total.set(1 +)"), []);
  assert.ok(
    String(spy.mock.calls[0]!.arguments[0]).includes('expression at position 0: unexpected "end of formula"'),
  );
  assert.deepEqual(parse("#total.set(1 +)"), []);
  assert.equal(spy.mock.callCount(), 1, "the expression error is reported once per attribute string");
});

test("the escape rule: \\' and \\\\ inside strings are skipped by the splitters", () => {
  const [phrase] = parse("#x.set('it\\'s;ok'); #y.show()");
  assert.ok(phrase);
  assert.equal(phrase.units.length, 1);
  assert.deepEqual(first(phrase).calls[0]!.arg, { kind: "expr", source: "'it\\'s;ok'", position: 0 });

  const [nested] = parse("#x.set('a\\',b')");
  assert.ok(nested);
  assert.deepEqual(first(nested).calls[0]!.arg, { kind: "expr", source: "'a\\',b'", position: 0 });

  const [joined] = parse("#x.set('a\\' && b')");
  assert.ok(joined);
  assert.equal(joined.units.length, 1);
  assert.equal(joined.operator, undefined);

  const [escapedBackslash] = parse("#x.set('\\\\D')");
  assert.ok(escapedBackslash);
  assert.deepEqual(first(escapedBackslash).calls[0]!.arg, { kind: "string", value: "\\D" });
});

test("a backslash escapes only the quote and itself; every other \\x stays verbatim", () => {
  assert.deepEqual(first(parse("#x.set('\\D')")[0]!).calls[0]!.arg, { kind: "string", value: "\\D" });
  assert.deepEqual(first(parse("#x.set('\\'')")[0]!).calls[0]!.arg, {
    kind: "expr",
    source: "'\\''",
    position: 0,
  });
  assert.deepEqual(first(parse("#x.set('\\\\')")[0]!).calls[0]!.arg, { kind: "string", value: "\\" });
});

function span(source: string, node: { start: number; end: number }): string {
  return source.slice(node.start, node.end);
}

test("offsets slice a phrase back to its source", () => {
  const source = "#f.send()";
  const [phrase] = parse(source);
  assert.ok(phrase);
  assert.equal(span(source, phrase), source);
  const unit = first(phrase);
  assert.equal(span(source, unit), "#f.send()");
  assert.equal(span(source, unit.ref), "#f");
  assert.equal(span(source, unit.calls[0]!), "send()");
});

test("offsets slice a multi-unit phrase around &&", () => {
  const source = "#a.show() && #b.hide()";
  const [phrase] = parse(source);
  assert.ok(phrase);
  assert.equal(phrase.operator, "&&");
  assert.equal(span(source, phrase), source);
  assert.equal(span(source, phrase.units[0]!), "#a.show()");
  assert.equal(span(source, phrase.units[1]!), "#b.hide()");
  assert.equal(span(source, phrase.units[0]!.calls[0]!), "show()");
  assert.equal(span(source, phrase.units[1]!.ref), "#b");
});

test("offsets slice chained calls back to each link", () => {
  const source = "#a.show().focus()";
  const [phrase] = parse(source);
  assert.ok(phrase);
  const unit = first(phrase);
  assert.equal(span(source, unit), source);
  assert.equal(unit.calls.length, 2);
  assert.equal(span(source, unit.calls[0]!), "show()");
  assert.equal(span(source, unit.calls[1]!), "focus()");
});

test("offsets slice an object-literal argument and its nested fields", () => {
  const source = "#total.sum({root: #list, select: '.amount'})";
  const [phrase] = parse(source);
  assert.ok(phrase);
  const arg = first(phrase).calls[0]!.arg;
  assert.ok(arg);
  assert.ok(arg.kind === "object");
  assert.equal(span(source, arg), "{root: #list, select: '.amount'}");
  assert.equal(span(source, arg.fields[0]!.value), "#list");
  assert.equal(span(source, arg.fields[1]!.value), "'.amount'");
});

test("offsets slice a this receiver", () => {
  const source = "this.reset()";
  const [phrase] = parse(source);
  assert.ok(phrase);
  const unit = first(phrase);
  assert.equal(span(source, unit.ref), "this");
  assert.equal(span(source, unit), source);
  assert.equal(span(source, unit.calls[0]!), "reset()");
});

test("offsets slice a read property argument", () => {
  const source = "#x.set(this.value)";
  const [phrase] = parse(source);
  assert.ok(phrase);
  const arg = first(phrase).calls[0]!.arg;
  assert.ok(arg);
  assert.ok(arg.kind === "read");
  assert.equal(span(source, arg), "this.value");
  assert.equal(span(source, arg.ref), "this");
  assert.equal(arg.property, "value");
});

test("offsets slice an expression argument and a nested object-field expression", () => {
  const source = "#qty.set(#price.value * 2)";
  const [phrase] = parse(source);
  assert.ok(phrase);
  const arg = first(phrase).calls[0]!.arg;
  assert.ok(arg);
  assert.ok(arg.kind === "expr");
  assert.equal(span(source, arg), "#price.value * 2");
  assert.equal(arg.source, "#price.value * 2");
  assert.equal(arg.position, 0);

  const nestedSource = "#x.set({name: 'value', value: this.value + '!'})";
  const [nested] = parse(nestedSource);
  assert.ok(nested);
  const object = first(nested).calls[0]!.arg;
  assert.ok(object);
  assert.ok(object.kind === "object");
  const value = object.fields[1]!.value;
  assert.ok(value.kind === "expr");
  assert.equal(span(nestedSource, value), "this.value + '!'");
});

test("parseWithErrors exposes failures as data with ranges", () => {
  const source = "#a.show(); .hide()";
  const { phrases, errors } = parseWithErrors(source);
  assert.equal(phrases.length, 1);
  assert.equal(errors.length, 1);
  const error = errors[0]!;
  assert.equal(error.message, "missing receiver");
  assert.equal(error.start, error.end);
  assert.equal(source.slice(error.start, error.end), "");
});

test("an empty link between dots reports an empty span", () => {
  const source = "#a..b()";
  const { errors } = parseWithErrors(source);
  assert.equal(errors.length, 1);
  const error = errors[0]!;
  assert.equal(error.message, "empty link between dots");
  assert.equal(error.start, error.end);
  assert.equal(source.slice(error.start, error.end), "");
});

test("a bad id error spans the offending id text", () => {
  const source = "#x.set(#q:b)";
  const { errors } = parseWithErrors(source);
  assert.equal(errors.length, 1);
  const error = errors[0]!;
  assert.ok(error.message.includes('invalid id "q:b"'));
  assert.equal(source.slice(error.start, error.end), "q:b");
});

test("a malformed object field error spans the field", () => {
  const source = "#x.set({bad})";
  const { errors } = parseWithErrors(source);
  assert.equal(errors.length, 1);
  const error = errors[0]!;
  assert.ok(error.message.includes('object field "bad" needs "name: value"'));
  assert.equal(source.slice(error.start, error.end), "bad");
});

test("parse and parseWithErrors share one cache that carries offsets", () => {
  const source = "#a.b().c()";
  const [fromParse] = parse(source);
  const { phrases } = parseWithErrors(source);
  assert.strictEqual(phrases[0], fromParse);
  assert.equal(span(source, phrases[0]!.units[0]!.calls[1]!), "c()");
});