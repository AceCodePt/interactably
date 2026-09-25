import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/analysis.ts";
import { computeCompletions } from "../src/completion.ts";
import type { DocumentAnalysis } from "../src/analysis.ts";
import { fixture, siteExample, vocabulary } from "./support.ts";

function analysisOf(text: string): DocumentAnalysis {
  return analyze(text, vocabulary);
}

function completionsAt(analysis: DocumentAnalysis, offset: number) {
  const result = computeCompletions(analysis, analysis.document.positionAt(offset));
  assert.ok(result !== null, "expected completion items");
  return result;
}

function labels(analysis: DocumentAnalysis, offset: number): string[] {
  return completionsAt(analysis, offset).map((item) => item.label);
}

test("completion: after # lists the document's ids", () => {
  const text = fixture("completion-hash.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf('on-click="#') + 'on-click="#'.length;
  assert.deepEqual(labels(analysis, offset), ["field", "go"]);
});

test("completion: after #id. lists that element's verbs with signatures", () => {
  const text = fixture("completion-verbs.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("#go.set") + "#go.".length;
  const items = completionsAt(analysis, offset);
  assert.deepEqual(
    items.map((item) => item.label),
    ["clear", "reset", "set"],
  );
  assert.equal(items.find((item) => item.label === "set")?.detail, "string | number");
});

test("completion: after this. lists the source element's verbs", () => {
  const text = '<script type="module" implements="modifiable" src="x"></script>\n<button implements="modifiable" on-click="this.set(\'x\')">x</button>';
  const analysis = analysisOf(text);
  const offset = text.indexOf("this.set") + "this.".length;
  assert.deepEqual(labels(analysis, offset), ["clear", "reset", "set"]);
});

test("completion: an element's implements lists built-ins and ranks undeclared lower", () => {
  const text = fixture("completion-element-implements.html");
  const analysis = analysisOf(text);
  const offset = text.lastIndexOf('implements="') + 'implements="'.length;
  const items = completionsAt(analysis, offset);
  assert.equal(items.length, vocabulary.names.length);
  const declared = items.find((item) => item.label === "modifiable");
  const undeclared = items.find((item) => item.label === "revealable");
  assert.equal(declared?.sortText, "0modifiable");
  assert.equal(undeclared?.sortText, "1revealable");
  assert.match(undeclared?.detail ?? "", /not declared/);
});

test("completion: the bootstrap tag's implements lists names not yet listed", () => {
  const text = fixture("completion-bootstrap-implements.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf('implements="') + 'implements="'.length;
  const result = labels(analysis, offset);
  assert.ok(!result.includes("modifiable"));
  assert.ok(result.includes("attributable"));
  assert.equal(result.length, vocabulary.names.length - 1);
});

test("completion: an attribute-name position lists on-<event>", () => {
  const text = fixture("completion-attribute-name.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("<div ") + "<div ".length;
  const result = labels(analysis, offset);
  assert.ok(result.includes("on-click"));
  assert.ok(result.includes("on-rendered"));
  assert.ok(result.every((label) => label.startsWith("on-")));
});

test("completion: a partial attribute name filters to its event prefix", () => {
  const text = fixture("completion-on-prefix.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("on-c") + "on-c".length;
  const result = labels(analysis, offset);
  assert.ok(result.includes("on-click"));
  assert.ok(result.includes("on-copy"));
  assert.ok(!result.includes("on-input"));
  assert.ok(result.every((label) => label.startsWith("on-c")));
});

test("completion: todo-list.html lists ids and verbs", () => {
  const text = siteExample("todo-list.html");
  const analysis = analysisOf(text);
  const hashOffset = text.indexOf('on-click="#todo-list') + 'on-click="#'.length;
  const ids = labels(analysis, hashOffset);
  assert.ok(ids.includes("todo-list"));
  assert.ok(ids.includes("todo-input"));

  const verbOffset = text.indexOf("#todo-list.render") + "#todo-list.".length;
  const item = completionsAt(analysis, verbOffset).find((candidate) => candidate.label === "render");
  assert.ok(item);
  assert.match(item.detail ?? "", /template/);
});
