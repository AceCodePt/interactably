import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";
import {
  FakeResizeObserver,
  installFakeResizeObserver,
  resetFakeResizeObserver,
} from "@tests/resize-observer.ts";
import { FormulaError, evaluateFormula } from "@utils/formula.ts";
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

test("#a.value is a number when the text parses, else a string; empty is the empty string", () => {
  const numeric = document.createElement("input");
  numeric.id = "numeric";
  numeric.value = "42";
  const words = document.createElement("input");
  words.id = "words";
  words.value = "abc";
  const empty = document.createElement("input");
  empty.id = "empty";
  empty.value = "";
  document.body.append(numeric, words, empty);

  const n = evaluateFormula("#numeric.value");
  assert.equal(n.value, 42);
  assert.equal(evaluateFormula("#words.value").value, "abc");
  assert.equal(evaluateFormula("#empty.value").value, "");
});

test("a missing element referenced by .value throws not-found", () => {
  assert.throws(() => evaluateFormula("#ghost.value"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes("#ghost not found"), err.message);
    assert.ok(!err.message.includes("(empty)"), err.message);
    return true;
  });
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

test("a bare reference is a parse error naming the fix", () => {
  const a = document.createElement("input");
  a.id = "a";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a"), /needs \.value, \.checked, \.height or \.width/);
  assert.throws(() => evaluateFormula("#a + 1"), /needs \.value, \.checked, \.height or \.width/);
  assert.throws(() => evaluateFormula("#a.textContent"), /needs \.value, \.checked, \.height or \.width/);
});

test("+ joins when either side is a string and adds otherwise, left to right", () => {
  assert.equal(evaluateFormula("1 + 2").value, 3);
  assert.equal(evaluateFormula("'a' + 1").value, "a1");
  assert.equal(evaluateFormula("1 + 'a'").value, "1a");
  assert.equal(evaluateFormula("'a' + 1 + 2").value, "a12");
  assert.equal(evaluateFormula("1 + 2 + 'a'").value, "3a");
});

test("a value reference joins through + to build a string", () => {
  const slug = document.createElement("input");
  slug.id = "slug";
  slug.value = "x";
  document.body.appendChild(slug);

  assert.equal(evaluateFormula("'invoice-' + #slug.value + '.pdf'").value, "invoice-x.pdf");
});

test("zip codes: two numeric-looking values add; a leading literal forces a join", () => {
  const zip1 = document.createElement("input");
  zip1.id = "zip1";
  zip1.value = "02134";
  const zip2 = document.createElement("input");
  zip2.id = "zip2";
  zip2.value = "90210";
  document.body.append(zip1, zip2);

  assert.equal(evaluateFormula("#zip1.value + #zip2.value").value, 92344);
  assert.equal(evaluateFormula("'' + #zip1.value + #zip2.value").value, "213490210");
});

test("a boolean is 1 and 0 in arithmetic: the line-item pattern", () => {
  const item = document.createElement("input");
  item.id = "item";
  item.type = "checkbox";
  item.value = "12.99";
  item.checked = true;
  document.body.appendChild(item);

  assert.equal(evaluateFormula("#item.value * #item.checked").value, 12.99);

  item.checked = false;
  assert.equal(evaluateFormula("#item.value * #item.checked").value, 0);
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

test("sum/count filter the set in the selector with :checked", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" type="checkbox" value="10" checked></li>
    <li><input class="amount" type="checkbox" value="20"></li>
    <li><input class="amount" type="checkbox" value="30" checked></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:checked')").value, 40);
  assert.equal(evaluateFormula("count('#list .amount:checked')").value, 2);
});

test("sum over plain inputs and count over li are unchanged", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<input class="amount" value="2.5"><input class="amount" value="3.25"><li class="row"></li><li class="row"></li>';
  document.body.appendChild(root);

  assert.equal(evaluateFormula("sum('.amount')").value, 5.75);
  assert.equal(evaluateFormula("count('.row')").value, 2);
});

test("arithmetic on a non-numeric reference throws a FormulaError naming operator, operand and reference", () => {
  const a = document.createElement("input");
  a.id = "a";
  a.value = "abc";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a.value - 1"), (err: unknown) => {
    assert.ok(err instanceof FormulaError);
    assert.ok(err.message.includes('"-"'), err.message);
    assert.ok(err.message.includes('"abc"'), err.message);
    assert.ok(err.message.includes("#a.value"), err.message);
    return true;
  });
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

test("#typo.value + 1 and #typo.checked throw not-found, not the strict-arithmetic empty error", () => {
  for (const source of ["#typo.value + 1", "#typo.checked"]) {
    assert.throws(() => evaluateFormula(source), (err: unknown) => {
      assert.ok(err instanceof Error, "expected an Error");
      assert.ok(err.message.includes("formula"), err.message);
      assert.ok(err.message.includes("#typo not found"), err.message);
      assert.ok(!err.message.includes("(empty)"), err.message);
      return true;
    });
  }
});

test("an existing element's value still reads and arithmetics", () => {
  const present = document.createElement("input");
  present.id = "present";
  present.value = "2";
  document.body.appendChild(present);

  assert.equal(evaluateFormula("#present.value + 1").value, 3);
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
    <li><input class="amount" value="10"></li>
    <li><input id="row3" class="amount" value=""></li>
    <li><input class="amount" value="30"></li>`;
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
    <li><input class="amount" value="10"></li>
    <li><input class="amount" required value=""></li>
    <li><input class="amount" value="30"></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:valid')").value, 40);
});

test("sum skips a blank placeholder row when filtered by :not(:placeholder-shown)", () => {
  const list = document.createElement("ul");
  list.id = "list";
  list.innerHTML = `
    <li><input class="amount" value="10"></li>
    <li><input class="amount" placeholder=" " value=""></li>
    <li><input class="amount" value="30"></li>`;
  document.body.appendChild(list);

  assert.equal(evaluateFormula("sum('#list .amount:not(:placeholder-shown)')").value, 40);
});

test("count over an empty selection is 0, no throw", () => {
  assert.equal(evaluateFormula("count('#list .none')").value, 0);
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
  a.value = "4";
  const b = document.createElement("input");
  b.id = "b";
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
  a.value = "4";
  const b = document.createElement("input");
  b.id = "b";
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

test("an unknown reference property lists all four readable properties", () => {
  const a = document.createElement("div");
  a.id = "a";
  document.body.appendChild(a);

  assert.throws(() => evaluateFormula("#a.foo"), /needs \.value, \.checked, \.height or \.width/);
});

test("this.value reads the source element passed in the context", () => {
  const self = document.createElement("input");
  self.value = "42";
  document.body.appendChild(self);

  assert.equal(evaluateFormula("this.value", { document, source: self }).value, 42);
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
  self.value = "2";
  const other = document.createElement("input");
  other.id = "other";
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
  assert.throws(() => evaluateFormula("this"), /reference this needs \.value, \.checked, \.height or \.width/);
  assert.throws(() => evaluateFormula("this + 1"), /reference this needs \.value, \.checked, \.height or \.width/);
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