import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/analysis.ts";
import { diagnose, fixture, findByCode, positionAfter, siteExample, siteExampleNames, substringOf, documentFor, vocabulary } from "./support.ts";

test("diagnostics: a parse error is reported verbatim at its range", () => {
  const text = fixture("parse-error.html");
  const diagnostics = diagnose(text);
  const parseError = findByCode(diagnostics, "parse-error");
  assert.ok(parseError, "expected a parse error");
  assert.match(parseError.message, /verb call with parens/);
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.code === "parse-error").length, 1);
  const valueStart = text.indexOf('on-click="') + 'on-click="'.length;
  assert.deepEqual(parseError.range.start, documentFor(text).positionAt(valueStart + 3));
});

test("diagnostics: an unknown verb is reported at the call", () => {
  const text = fixture("unknown-verb.html");
  const diagnostics = diagnose(text);
  assert.equal(diagnostics.length, 1);
  const diagnostic = diagnostics[0]!;
  assert.equal(diagnostic.code, "unknown-verb");
  assert.match(diagnostic.message, /shwo/);
  assert.deepEqual(diagnostic.range.start, positionAfter(text, "shwo"));
  assert.equal(substringOf(text, diagnostic), "shwo()");
});

test("diagnostics: an unknown receiver is reported at the ref", () => {
  const text = fixture("unknown-receiver.html");
  const diagnostic = findByCode(diagnose(text), "unknown-receiver");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /#ghost/);
  assert.deepEqual(diagnostic.range.start, positionAfter(text, "#ghost"));
  assert.equal(substringOf(text, diagnostic), "#ghost");
});

test("diagnostics: an unknown event is reported at the attribute name", () => {
  const text = fixture("unknown-event.html");
  const diagnostic = findByCode(diagnose(text), "unknown-event");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /nonsense/);
  assert.equal(substringOf(text, diagnostic), "on-nonsense");
});

test("diagnostics: an element using an undeclared implementation is reported at the name", () => {
  const text = fixture("undeclared-implementation.html");
  const diagnostic = findByCode(diagnose(text), "undeclared-implementation");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /revealable/);
  assert.equal(substringOf(text, diagnostic), "revealable");
});

test("diagnostics: a non-built-in on the bootstrap tag is reported at the name", () => {
  const text = fixture("unknown-implementation.html");
  const diagnostic = findByCode(diagnose(text), "unknown-implementation");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /bogus/);
  assert.equal(substringOf(text, diagnostic), "bogus");
});

test("diagnostics: a page with only element implements reports missing-bootstrap once", () => {
  const text = fixture("missing-bootstrap.html");
  const diagnostics = diagnose(text);
  assert.equal(diagnostics.length, 1);
  const diagnostic = diagnostics[0]!;
  assert.equal(diagnostic.code, "missing-bootstrap");
  assert.equal(diagnostic.severity, 3);
  assert.equal(substringOf(text, diagnostic), "implements");
});

test("diagnostics: element implements are usages, not declarations", () => {
  const text = fixture("missing-bootstrap.html");
  assert.equal(findByCode(diagnose(text), "undeclared-implementation"), undefined);
});

test("diagnostics: the bootstrap tag itself produces no diagnostics", () => {
  const text = fixture("completion-element-implements.html");
  const diagnostics = diagnose(text);
  const document = documentFor(text);
  const scriptStart = text.indexOf("<script");
  const scriptEnd = text.indexOf("</script>") + "</script>".length;
  for (const diagnostic of diagnostics) {
    const start = document.offsetAt(diagnostic.range.start);
    assert.ok(start < scriptStart || start >= scriptEnd, `unexpected diagnostic on the bootstrap script: ${diagnostic.message}`);
  }
});

test("diagnostics: an HTML entity inside a phrase keeps later positions correct", () => {
  const text = fixture("entity.html");
  const diagnostic = findByCode(diagnose(text), "unknown-verb");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /nope/);
  assert.deepEqual(diagnostic.range.start, positionAfter(text, "#b.nope", 3));
});

test("diagnostics: todo-list.html has no diagnostics", () => {
  const text = siteExample("todo-list.html");
  const diagnostics = diagnose(text);
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    [],
  );
});

test("diagnostics: a verb typo in todo-list.html yields exactly one diagnostic at the verb", () => {
  const text = siteExample("todo-list.html").replace("#todo-list.send()", "#todo-list.sned()");
  const diagnostics = diagnose(text);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.code, "unknown-verb");
  assert.deepEqual(diagnostics[0]!.range.start, positionAfter(text, "sned"));
});

test("diagnostics: dropping an implementation from the bootstrap reports each usage, never the script", () => {
  const text = siteExample("todo-list.html").replace(
    'implementations="attributable copyable modifiable renderable requestable storable"',
    'implementations="attributable copyable modifiable renderable requestable"',
  );
  const diagnostics = diagnose(text);
  const undeclared = diagnostics.filter(
    (diagnostic) => diagnostic.code === "undeclared-implementation",
  );
  assert.equal(undeclared.length, 1);
  assert.equal(substringOf(text, undeclared[0]!), "storable");

  const document = documentFor(text);
  const scriptStart = text.indexOf("<script");
  const scriptEnd = text.indexOf("</script>") + "</script>".length;
  for (const diagnostic of diagnostics) {
    const start = document.offsetAt(diagnostic.range.start);
    assert.ok(
      start < scriptStart || start >= scriptEnd,
      `the bootstrap script is never blamed: ${diagnostic.message}`,
    );
  }
});

test("diagnostics: a duplicate native id is reported on each occurrence", () => {
  const text = '<script type="module" implementations="revealable"></script>\n<div id="x"></div><span id="x"></span>';
  const duplicates = diagnose(text).filter((diagnostic) => diagnostic.code === "duplicate-id");
  assert.equal(duplicates.length, 2);
  for (const diagnostic of duplicates) {
    assert.equal(diagnostic.severity, 1);
    assert.equal(substringOf(text, diagnostic), "x");
  }
});

test("diagnostics: a three-way duplicate reports three diagnostics, one per occurrence", () => {
  const text =
    '<script type="module" implementations="revealable"></script>\n' +
    '<div id="x"></div><div id="x"></div><div id="x"></div>';
  const duplicates = diagnose(text).filter((diagnostic) => diagnostic.code === "duplicate-id");
  assert.equal(duplicates.length, 3);
  const starts = duplicates.map((diagnostic) => documentFor(text).offsetAt(diagnostic.range.start));
  assert.equal(new Set(starts).size, 3, "each diagnostic covers its own occurrence");
  for (const diagnostic of duplicates) assert.equal(substringOf(text, diagnostic), "x");
});

test("diagnostics: a duplicated -id config attribute is reported per attribute name", () => {
  const text =
    '<script type="module" implementations="revealable"></script>\n' +
    '<div storable-id="b"></div><div storable-id="b"></div>';
  const diagnostics = diagnose(text);
  const duplicates = diagnostics.filter((diagnostic) => diagnostic.code === "duplicate-named-id");
  assert.equal(duplicates.length, 2);
  for (const diagnostic of duplicates) assert.equal(substringOf(text, diagnostic), "b");
  assert.equal(findByCode(diagnostics, "duplicate-id"), undefined, "the native id namespace is untouched");
});

test("diagnostics: a -id value matching an element native id is clean", () => {
  const text =
    '<script type="module" implementations="revealable"></script>\n' +
    '<div id="same"></div><div storable-id="same"></div>';
  assert.deepEqual(
    diagnose(text).map((diagnostic) => diagnostic.code),
    [],
  );
});

test("diagnostics: a document with no duplicates is clean", () => {
  const text =
    '<script type="module" implementations="revealable"></script>\n' +
    '<div id="a"></div><div id="b"></div><div storable-id="c"></div>';
  assert.deepEqual(
    diagnose(text).map((diagnostic) => diagnostic.code),
    [],
  );
});

test("diagnostics: every site example reports zero diagnostics", () => {
  const names = siteExampleNames();
  assert.equal(names.length, 35, "all 35 site examples are covered");
  for (const name of names) {
    const diagnostics = diagnose(siteExample(name));
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.code),
      [],
      `${name} must be diagnostic-free`,
    );
  }
});

test("bootstrap: a script is a bootstrap only when it carries implementations", () => {
  const cdnSrc = '<script type="module" src="https://unpkg.com/interactably@1"></script>';
  const text = `${cdnSrc}\n<button on-click="#x.show()">x</button>`;
  assert.equal(analyze(text, vocabulary).hasBootstrap, false, "the src shape alone is not a bootstrap");
  assert.ok(findByCode(diagnose(text), "missing-bootstrap"), "the page reports missing-bootstrap");
});

test("bootstrap: a script[implementations] anywhere in the document anchors the page", () => {
  const text = '<button on-click="#x.show()">x</button>\n<script type="module" implementations="revealable"></script>';
  assert.equal(analyze(text, vocabulary).hasBootstrap, true, "a body-placed declaration is read");
  assert.equal(findByCode(diagnose(text), "missing-bootstrap"), undefined);
});
