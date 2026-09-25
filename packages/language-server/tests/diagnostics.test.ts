import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecognisedBootstrapSrc } from "../src/analysis.ts";
import { analyze } from "../src/analysis.ts";
import { diagnose, fixture, findByCode, positionAfter, siteExample, substringOf, documentFor, vocabulary } from "./support.ts";

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
    'implements="attributable copyable modifiable renderable requestable storable"',
    'implements="attributable copyable modifiable renderable requestable"',
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

test("bootstrap: every recognised URL shape anchors a page", () => {
  const names = [
    "url-jsdelivr.html",
    "url-jsdelivr-noversion.html",
    "url-esm-run.html",
    "url-unpkg.html",
    "url-esm-unpkg.html",
    "url-esm-sh.html",
    "url-node-modules.html",
    "url-dist-cdn.html",
    "url-unrecognised-implements.html",
  ];
  for (const name of names) {
    const text = fixture(name);
    assert.equal(findByCode(diagnose(text), "missing-bootstrap"), undefined, `${name} should have a bootstrap`);
    assert.equal(analyze(text, vocabulary).hasBootstrap, true, `${name} should have a bootstrap`);
  }
});

test("bootstrap: Skypack is not recognised", () => {
  const text = fixture("url-skypack.html");
  assert.ok(findByCode(diagnose(text), "missing-bootstrap"));
  assert.equal(analyze(text, vocabulary).hasBootstrap, false);
  assert.equal(isRecognisedBootstrapSrc("https://cdn.skypack.dev/interactably"), false);
});

test("bootstrap: the URL shapes match with and without a version", () => {
  const recognised = [
    "https://cdn.jsdelivr.net/npm/interactably/+esm",
    "https://cdn.jsdelivr.net/npm/interactably@1.2.3/+esm",
    "https://esm.run/interactably",
    "https://esm.run/interactably@1",
    "https://unpkg.com/interactably/dist/cdn/interactably-bootstrap.js",
    "https://unpkg.com/interactably@1.2.3/dist/cdn/interactably-bootstrap.js",
    "https://esm.unpkg.com/interactably@next",
    "https://esm.sh/interactably@1?dev",
    "/node_modules/interactably/dist/cdn/interactably-bootstrap.js",
    "../../dist/cdn/interactably-bootstrap.js",
  ];
  for (const source of recognised) {
    assert.equal(isRecognisedBootstrapSrc(source), true, source);
  }
  assert.equal(isRecognisedBootstrapSrc("https://example.com/interactably.js"), false);
  assert.equal(isRecognisedBootstrapSrc("https://cdn.jsdelivr.net/npm/other@1/+esm"), false);
  assert.equal(isRecognisedBootstrapSrc(""), false);
});
