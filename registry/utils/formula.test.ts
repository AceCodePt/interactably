import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import {
  FakeResizeObserver,
  installFakeResizeObserver,
  resetFakeResizeObserver,
} from "@tests/resize-observer.ts";
import { FormulaError, evaluateFormula, parseFormula } from "@utils/formula.ts";
import { MEASURED } from "@interactable/measure.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
  installFakeResizeObserver();
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  resetFakeResizeObserver();
  document.body.replaceChildren();
});

test("type=text reads the platform string: '05' stays '05', inputmode declares nothing", () => {
  const zip = document.createElement("input");
  zip.id = "zip";
  zip.value = "05";
  zip.setAttribute("inputmode", "numeric");
  const text = document.createElement("input");
  text.id = "text";
  text.value = "abc";
  document.body.append(zip, text);

  assert.equal(evaluateFormula("#zip.value").value, "05");
  assert.equal(evaluateFormula("#text.value").value, "abc");
});

test("two text inputs + join, two number inputs + add, text and number + join", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "05";
  const b = document.createElement("input");
  b.id = "b";
  b.value = "07";
  document.body.append(a, b);

  assert.equal(evaluateFormula("#a.value + #b.value").value, "0507");

  const n1 = document.createElement("input");
  n1.id = "n1";
  n1.type = "number";
  n1.value = "5";
  const n2 = document.createElement("input");
  n2.id = "n2";
  n2.type = "number";
  n2.value = "7";
  document.body.append(n1, n2);

  assert.equal(evaluateFormula("#n1.value + #n2.value").value, 12);

  assert.equal(evaluateFormula("#a.value + #n1.value").value, "055");
});

test("a value reference joins through + to build a string", () => {
  const slug = document.createElement("input");
  slug.id = "slug";
  slug.value = "x";
  document.body.appendChild(slug);

  assert.equal(evaluateFormula("'invoice-' + #slug.value + '.pdf'").value, "invoice-x.pdf");
});

test("type=number: an empty value is the empty error, an unparseable value is not-a-number", () => {
  const empty = document.createElement("input");
  empty.id = "empty";
  empty.type = "number";
  empty.value = "";
  const nan = document.createElement("input");
  nan.id = "nan";
  nan.type = "number";
  Object.defineProperty(nan, "value", { value: "abc", configurable: true });
  document.body.append(empty, nan);

  assert.throws(() => evaluateFormula("#empty.value * 2"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "empty");
    assert.ok(err.message.includes("#empty.value"), err.message);
    return true;
  });

  assert.throws(() => evaluateFormula("#nan.value + 1"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "not-a-number");
    assert.ok(err.message.includes("#nan.value"), err.message);
    return true;
  });
});

test("- on a text input is not-a-number naming the reference", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "abc";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a.value - 1"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "not-a-number");
    assert.ok(err.message.includes('"-"'), err.message);
    assert.ok(err.message.includes('"abc"'), err.message);
    assert.ok(err.message.includes("#a.value"), err.message);
    return true;
  });
});

test("type=range reads valueAsNumber", () => {
  const range = document.createElement("input");
  range.id = "range";
  range.type = "range";
  range.value = "50";
  document.body.appendChild(range);

  assert.equal(evaluateFormula("#range.value").value, 50);
});

test("a checkbox reads .value as its checked boolean, and the value= attribute is unreachable through .value", () => {
  const on = document.createElement("input");
  on.id = "on";
  on.type = "checkbox";
  on.value = "12.99";
  on.checked = true;
  const off = document.createElement("input");
  off.id = "off";
  off.type = "checkbox";
  off.value = "12.99";
  off.checked = false;
  document.body.append(on, off);

  assert.equal(evaluateFormula("#on.value").value, "true");
  assert.equal(evaluateFormula("#on.value * 1").value, 1);
  assert.equal(evaluateFormula("#off.value * 1").value, 0);
});

test("#a.checked is the element's checked boolean, false when there is none", () => {
  const on = document.createElement("input");
  on.id = "on";
  on.type = "checkbox";
  on.checked = true;
  const off = document.createElement("input");
  off.id = "off";
  off.type = "checkbox";
  off.checked = false;
  const plain = document.createElement("div");
  plain.id = "plain";
  document.body.append(on, off, plain);

  assert.equal(evaluateFormula("#on.checked").value, "true");
  assert.equal(evaluateFormula("#off.checked").value, "false");
  assert.equal(evaluateFormula("#plain.checked").value, "false");
});

test("a missing element referenced by .value throws not-found", () => {
  assert.throws(() => evaluateFormula("#ghost.value"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes("#ghost not found"), err.message);
    assert.ok(!err.message.includes("(empty)"), err.message);
    return true;
  });
});

test("a bare reference is a parse error naming the fix", () => {
  const a = document.createElement("input");
  a.id = "a";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a"), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => evaluateFormula("#a + 1"), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => evaluateFormula("#a.textContent"), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
});

test("+ joins when either side is a string and adds otherwise, left to right", () => {
  assert.equal(evaluateFormula("1 + 2").value, 3);
  assert.equal(evaluateFormula("'a' + 1").value, "a1");
  assert.equal(evaluateFormula("1 + 'a'").value, "1a");
  assert.equal(evaluateFormula("'a' + 1 + 2").value, "a12");
  assert.equal(evaluateFormula("1 + 2 + 'a'").value, "3a");
});

test("a boolean is 1 and 0 in arithmetic: the line-item pattern", () => {
  const item = document.createElement("input");
  item.id = "item";
  item.type = "number";
  item.value = "12.99";
  const tick = document.createElement("input");
  tick.id = "tick";
  tick.type = "checkbox";
  tick.checked = true;
  document.body.append(item, tick);

  assert.equal(evaluateFormula("#item.value * #tick.checked").value, 12.99);

  tick.checked = false;
  assert.equal(evaluateFormula("#item.value * #tick.checked").value, 0);
});

test("checked references add as 1/0 and min coerces them", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.type = "checkbox";
  a.checked = true;
  const b = document.createElement("input");
  b.id = "b";
  b.type = "checkbox";
  b.checked = false;
  document.body.append(a, b);

  assert.equal(evaluateFormula("#a.checked + #b.checked").value, 1);
  assert.equal(evaluateFormula("min(#a.checked, 5)").value, 1);
  assert.equal(evaluateFormula("min(#b.checked, 5)").value, 0);

  a.checked = false;
  assert.equal(evaluateFormula("#a.checked + #b.checked").value, 0);
});

test("sum/count filter the set in the selector with :checked, totalling booleans as 1/0", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="checkbox" checked></li>
    <li><input class="amount" type="checkbox"></li>
    <li><input class="amount" type="checkbox" checked></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:checked')").value, 2);
  assert.equal(evaluateFormula("count('#list .amount:checked')").value, 2);
});

test("sum totals number-typed elements and count over li is unchanged", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<input class="amount" type="number" value="2.5"><input class="amount" type="number" value="3.25"><li class="row"></li><li class="row"></li>';
  document.body.appendChild(root);

  assert.equal(evaluateFormula("sum('.amount')").value, 5.75);
  assert.equal(evaluateFormula("count('.row')").value, 2);
});

test("sum is strict: a string-typed element errors naming match 1", () => {
  const root = document.createElement("div");
  root.innerHTML = '<span class="amount">7</span><span class="amount">8</span>';
  document.body.appendChild(root);

  assert.throws(() => evaluateFormula("sum('.amount')"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "not-a-number");
    assert.ok(err.message.includes("match 1"), err.message);
    assert.ok(err.message.includes("sum()"), err.message);
    return true;
  });
});

test("numeric functions require number arguments", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "x";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("min(#a.value, 3)"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes("min()"), err.message);
    assert.ok(err.message.includes("#a.value"), err.message);
    return true;
  });
});

test("sum is strict: a blank row is an error naming the row's id", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="number" value="10"></li>
    <li><input id="row3" class="amount" type="number" value=""></li>
    <li><input class="amount" type="number" value="30"></li>`;
  document.body.appendChild(list);

  assert.throws(() => evaluateFormula("sum('#list .amount')"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes("#row3"), err.message);
    assert.ok(err.message.includes("sum()"), err.message);
    return true;
  });
});

test("sum skips a required-but-blank row when filtered by :valid", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="number" value="10"></li>
    <li><input class="amount" type="number" required value=""></li>
    <li><input class="amount" type="number" value="30"></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:valid')").value, 40);
});

test("sum skips a blank placeholder row when filtered by :not(:placeholder-shown)", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="number" value="10"></li>
    <li><input class="amount" type="number" placeholder=" " value=""></li>
    <li><input class="amount" type="number" value="30"></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:not(:placeholder-shown)')").value, 40);
});

test("count over an empty selection is 0, no throw", () => {
  assert.equal(evaluateFormula("count('#list .none')").value, 0);
});

test("an empty .value operand is an error marked (empty)", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "";
  const b = document.createElement("input");
  b.id = "b";
  b.value = "3";
  document.body.append(a, b);

  assert.throws(() => evaluateFormula("#a.value * #b.value"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes("(empty)"), err.message);
    return true;
  });
});

test("an empty .value is an empty-operand error under +, not a silent join", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "";
  const b = document.createElement("input");
  b.id = "b";
  b.value = "3";
  document.body.append(a, b);

  for (const source of ["#a.value + 1", "1 + #a.value + 3", "#a.value + #b.value"]) {
    assert.throws(() => evaluateFormula(source), (err: unknown) => {
      assert.ok(err instanceof FormulaError, `expected FormulaError for ${source}`);
      assert.ok(err.message.includes("(empty)"), err.message);
      assert.ok(err.message.includes('"+"'), err.message);
      return true;
    });
  }
});

test("a literal string still forces a join, empty reference included", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "";
  const slug = document.createElement("input");
  slug.id = "slug";
  slug.value = "x";
  document.body.append(a, slug);

  assert.equal(evaluateFormula("'' + #a.value").value, "");
  assert.equal(evaluateFormula("'invoice-' + #slug.value + '.pdf'").value, "invoice-x.pdf");
});

test("a missing element is a not-found error for .value and .checked, even in a join", () => {
  for (const source of ["#gone.value * 2", "#gone.value + 1", "'' + #gone.value", "#gone.checked"]) {
    assert.throws(() => evaluateFormula(source), (err: unknown) => {
      assert.ok(err instanceof Error, "expected an Error");
      assert.ok(err.message.includes("#gone not found"), err.message);
      assert.ok(!err.message.includes("(empty)"), err.message);
      return true;
    });
  }
});

test("an existing number element's value still reads and arithmetics", () => {
  const present = document.createElement("input");
  present.id = "present";
  present.type = "number";
  present.value = "2";
  document.body.appendChild(present);

  assert.equal(evaluateFormula("#present.value + 1").value, 3);
});

test("#a.checked stays a boolean: 1 and 0 in arithmetic", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.type = "checkbox";
  a.checked = true;
  document.body.appendChild(a);

  assert.equal(evaluateFormula("#a.checked * 5").value, 5);
  a.checked = false;
  assert.equal(evaluateFormula("#a.checked * 5").value, 0);
});

test("division by zero is an error: 1 / 0, 0 / 0 and -0 divisors throw, naming the literal", () => {
  for (const source of ["1 / 0", "0 / 0", "1 / -0"]) {
    assert.throws(() => evaluateFormula(source), (err: unknown) => {
      assert.ok(err instanceof FormulaError);
      assert.equal(err.operator, "/");
      assert.equal(err.operand, 0);
      assert.ok(err.message.includes("divided by zero"), err.message);
      assert.ok(err.message.includes("(literal)"), err.message);
      return true;
    });
  }
});

test("an empty divisor reference is an empty-operand error, not division by zero", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.type = "number";
  a.value = "4";
  const b = document.createElement("input");
  b.id = "b";
  b.type = "number";
  b.value = "";
  document.body.append(a, b);

  assert.throws(() => evaluateFormula("#a.value / #b.value"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes("#b.value"), err.message);
    assert.ok(err.message.includes("(empty)"), err.message);
    assert.ok(!err.message.includes("divided by zero"), err.message);
    return true;
  });
});

test("a zero-valued reference divisor is a division error naming the reference", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.type = "number";
  a.value = "4";
  const b = document.createElement("input");
  b.id = "b";
  b.type = "number";
  b.value = "0";
  document.body.append(a, b);

  assert.throws(() => evaluateFormula("#a.value / #b.value"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.operator, "/");
    assert.equal(err.operand, 0);
    assert.ok(err.message.includes("#b.value"), err.message);
    assert.ok(err.message.includes("divided by zero"), err.message);
    assert.ok(!err.message.includes("(literal)"), err.message);
    return true;
  });
});

test("#nav.height and #nav.width read the measured border-box size from the cache", () => {
  const nav = document.createElement("header");
  nav.id = "nav";
  document.body.appendChild(nav);

  assert.equal(evaluateFormula("#nav.height").value, 0, "before any report the fallback rect reads");

  const observer = FakeResizeObserver.instances[0]!;
  observer.trigger([{ target: nav, borderBoxSize: [{ blockSize: 74, inlineSize: 120 }] }]);
  assert.equal(evaluateFormula("#nav.height").value, 74);
  assert.equal(evaluateFormula("#nav.width").value, 120);
  assert.equal(evaluateFormula("-#nav.height").value, -74, "a measured size arithmetic");

  observer.trigger([{ target: nav, borderBoxSize: [{ blockSize: 80, inlineSize: 120 }] }]);
  assert.equal(evaluateFormula("#nav.height").value, 80, "a later report refreshes the cache");
});

test("a .height/.width reference to a missing id throws not-found", () => {
  for (const source of ["#ghost.height", "#ghost.width", "#ghost.height + 1"]) {
    assert.throws(() => evaluateFormula(source), (err: unknown) => {
      assert.ok(err instanceof Error, "expected an Error");
      assert.ok(err.message.includes("#ghost not found"), err.message);
      assert.ok(!err.message.includes("(empty)"), err.message);
      return true;
    });
  }
});

test("an unknown reference property lists all the readable properties", () => {
  const a = document.createElement("div");
  a.id = "a";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a.foo"), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
});

test("this.value reads the source element passed in the context", () => {
  const self = document.createElement("input");
  self.value = "42";
  document.body.appendChild(self);

  assert.equal(evaluateFormula("this.value", { document, source: self }).value, "42");
});

test("this.checked on an unchecked box is false", () => {
  const self = document.createElement("input");
  self.type = "checkbox";
  self.checked = false;
  document.body.appendChild(self);

  assert.equal(evaluateFormula("this.checked", { document, source: self }).value, "false");
});

test("this.height and this.width read the source's measured border-box size", () => {
  const self = document.createElement("header");
  document.body.appendChild(self);

  assert.equal(
    evaluateFormula("this.height", { document, source: self }).value,
    0,
    "before any report the fallback rect reads",
  );

  (self as unknown as Record<PropertyKey, unknown>)[MEASURED] = { width: 120, height: 74 };
  assert.equal(evaluateFormula("this.height", { document, source: self }).value, 74);
  assert.equal(evaluateFormula("this.width", { document, source: self }).value, 120);
});

test("this.value mixes with #id references in one formula", () => {
  const self = document.createElement("input");
  self.type = "number";
  self.value = "2";
  const other = document.createElement("input");
  other.id = "other";
  other.type = "number";
  other.value = "3";
  document.body.append(self, other);

  assert.equal(evaluateFormula("this.value + #other.value", { document, source: self }).value, 5);
});

test("a formula reading this without a source element throws the no-element-here error", () => {
  assert.throws(() => evaluateFormula("this.value"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes("this has no element here"), err.message);
    return true;
  });
});

test("this is a keyword: a bare this is a reference error, and this(...) is an unknown function", () => {
  assert.throws(() => evaluateFormula("this"), /reference this needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => evaluateFormula("this + 1"), /reference this needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => evaluateFormula("this(1)"), /unknown function this\(\)/);
});

test("an empty this.value operand is an empty-operand error naming this.value", () => {
  const self = document.createElement("input");
  self.value = "";
  document.body.appendChild(self);

  assert.throws(() => evaluateFormula("this.value * 2", { document, source: self }), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes("this.value"), err.message);
    assert.ok(err.message.includes("(empty)"), err.message);
    return true;
  });
});

test("formattable numeric-format output reads a number from formattable-value", () => {
  const out = document.createElement("output");
  out.id = "out";
  out.setAttribute("formattable-value", "42");
  out.setAttribute("formattable-format", "{ style: 'currency', currency: 'USD' }");
  out.textContent = "$42.00";
  document.body.appendChild(out);

  assert.equal(evaluateFormula("#out.value").value, 42);
});

test("formattable date-format output reads a string", () => {
  const out = document.createElement("output");
  out.id = "out";
  out.setAttribute("formattable-value", "2024-01-02");
  out.setAttribute("formattable-format", "{ type: 'date', dateStyle: 'medium' }");
  out.textContent = "Jan 2, 2024";
  document.body.appendChild(out);

  assert.equal(evaluateFormula("#out.value").value, "Jan 2, 2024");
});

test("a plain span reads textContent as a string", () => {
  const span = document.createElement("span");
  span.id = "span";
  span.textContent = "7";
  document.body.appendChild(span);

  assert.equal(evaluateFormula("#span.value").value, "7");
});

test("#q.min, #q.max and #q.step read numbers on a number input", () => {
  const q = document.createElement("input");
  q.id = "q";
  q.type = "number";
  q.min = "0";
  q.max = "10";
  q.step = "2";
  document.body.appendChild(q);

  assert.equal(evaluateFormula("#q.min").value, 0);
  assert.equal(evaluateFormula("#q.max").value, 10);
  assert.equal(evaluateFormula("#q.step").value, 2);
});

test("min(#q.max, #q.value + 1) clamps the way the author says", () => {
  const q = document.createElement("input");
  q.id = "q";
  q.type = "number";
  q.max = "10";
  q.value = "10";
  document.body.appendChild(q);

  assert.equal(evaluateFormula("min(#q.max, #q.value + 1)").value, 10);
  q.value = "3";
  assert.equal(evaluateFormula("min(#q.max, #q.value + 1)").value, 4);
});

test("an absent max reads empty: the empty-operand error names #q.max", () => {
  const q = document.createElement("input");
  q.id = "q";
  q.type = "number";
  document.body.appendChild(q);

  assert.throws(() => evaluateFormula("min(#q.max, #q.value + 1)"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "empty");
    assert.ok(err.message.includes("#q.max"), err.message);
    return true;
  });
});

test("an absent step on a number input reads the platform default 1", () => {
  const q = document.createElement("input");
  q.id = "q";
  q.type = "number";
  q.value = "4";
  document.body.appendChild(q);

  assert.equal(evaluateFormula("#q.step").value, 1);
  assert.equal(evaluateFormula("#q.value + #q.step").value, 5);
});

test("step on a date input is the string, a span's step is empty", () => {
  const d = document.createElement("input");
  d.id = "d";
  d.type = "date";
  d.setAttribute("step", "7");
  document.body.appendChild(d);

  assert.equal(evaluateFormula("#d.step").value, "7");

  const span = document.createElement("span");
  span.id = "span";
  document.body.appendChild(span);

  assert.equal(evaluateFormula("#span.step").value, "");
});

test("a backslash escapes only the quote and itself; every other \\x stays verbatim", () => {
  assert.equal(evaluateFormula("'\\D'").value, "\\D");
  assert.equal(evaluateFormula("'\\''").value, "'");
  assert.equal(evaluateFormula("'\\\\'").value, "\\");
});

test("replace strips non-digits from a string", () => {
  assert.equal(evaluateFormula("replace('a1b2', '\\D', '')").value, "12");
});

test("replace is always global and supports $1 group references", () => {
  assert.equal(evaluateFormula("replace('1-2-3', '-', '')").value, "123");
  assert.equal(evaluateFormula("replace('John Smith', '(\\w+) (\\w+)', '$2, $1')").value, "Smith, John");
});

test("replace('', '\\D', '') is the empty string, not an empty-operand error", () => {
  assert.equal(evaluateFormula("replace('', '\\D', '')").value, "");
});

test("replace takes exactly three arguments", () => {
  assert.throws(() => evaluateFormula("replace('a', 'b')"), /takes 3 arguments/);
  assert.throws(() => evaluateFormula("replace('a', 'b', 'c', 'd')"), /takes 3 arguments/);
});

test("replace accepts a text input's string first argument", () => {
  const zip = document.createElement("input");
  zip.id = "zip";
  zip.value = "05";
  document.body.appendChild(zip);

  assert.equal(evaluateFormula("replace(#zip.value, '\\D', '')").value, "05");
});

test("replace refuses a number first argument, naming the origin and the .value rule", () => {
  const num = document.createElement("input");
  num.id = "num";
  num.type = "number";
  num.value = "5";
  document.body.appendChild(num);

  assert.throws(() => evaluateFormula("replace(#num.value, '\\D', '')"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "not-a-string");
    assert.ok(
      err.message.includes("replace() needs a string as its first argument; #num.value read as a number"),
      err.message,
    );
    assert.ok(err.message.includes("see the .value rule"), err.message);
    return true;
  });
});

test("replace rejects an invalid pattern as a FormulaError naming the pattern", () => {
  assert.throws(() => evaluateFormula("replace('a', '[', 'b')"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.equal(err.reason, "invalid-pattern");
    assert.ok(err.message.includes("invalid pattern"), err.message);
    assert.ok(err.message.includes('"["'), err.message);
    return true;
  });
});

test("replace(this.value, …) reads the source element the formula is on", () => {
  const self = document.createElement("input");
  self.value = "1-2-3";
  document.body.appendChild(self);

  assert.equal(evaluateFormula("replace(this.value, '-', '')", { document, source: self }).value, "123");
});

test("replace nests inside + with a non-numeric-looking value", () => {
  const phone = document.createElement("input");
  phone.id = "phone";
  phone.value = "(555) 123-4567";
  document.body.appendChild(phone);

  assert.equal(evaluateFormula("'tel:' + replace(#phone.value, '\\D', '')").value, "tel:5551234567");
});

test("parseFormula validates syntax without a document or source, gating data errors", () => {
  assert.doesNotThrow(() => parseFormula("1 + 2"));
  assert.doesNotThrow(() => parseFormula("min(#a.value, 3)"));
  assert.doesNotThrow(() => parseFormula("min(#q.max, #q.value + 1)"));
  assert.doesNotThrow(() => parseFormula("#ghost.value + 1"));
  assert.doesNotThrow(() => parseFormula("this.value * 2"));
  assert.doesNotThrow(() => parseFormula("1 / 0"));
  assert.doesNotThrow(() => parseFormula("replace(#num.value, '\\D', '')"));
  assert.doesNotThrow(() => parseFormula("sum('.amount')"));
  assert.doesNotThrow(() => parseFormula("'invoice-' + #slug.value + '.pdf'"));

  assert.throws(() => parseFormula("1 +"), /unexpected "end of formula"/);
  assert.throws(() => parseFormula("#a."), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => parseFormula("#a.foo"), /needs \.value, \.checked, \.min, \.max, \.step, \.height or \.width/);
  assert.throws(() => parseFormula("min()"), /min\(\) needs at least one argument/);
  assert.throws(() => parseFormula("floor(1, 2)"), /floor\(\) takes 1 argument/);
  assert.throws(() => parseFormula("'unterminated"), /unterminated string/);
  assert.throws(() => parseFormula("frobnicate(1)"), /unknown function frobnicate\(\)/);
  assert.throws(() => parseFormula("1 + (2"), /missing \)/);
});