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
  const offset = text.indexOf("#go.set") + 1;
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
  const text = `<script type="module" implementations="modifiable" src="x"></script>\n<button modifiable on-click="() => { this.set('x') }">x</button>`;
  const analysis = analysisOf(text);
  const offset = text.indexOf("this.set") + "this.".length;
  assert.deepEqual(labels(analysis, offset), ["clear", "reset", "set"]);
});

test("completion: an attribute-name position lists implementation attributes", () => {
  const text = fixture("completion-element-attribute.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("<div id=\"d\" ") + "<div id=\"d\" ".length;
  const result = labels(analysis, offset);
  assert.ok(result.includes("requestable"));
  assert.ok(result.includes("modifiable"));
  assert.ok(result.includes("on-click"));
});

test("completion: after a presence attribute, its config, state and events are offered", () => {
  const text = fixture("completion-presence.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("requestable >") + "requestable ".length;
  const result = labels(analysis, offset);
  assert.ok(result.includes("requestable-url"));
  assert.ok(result.includes("requestable-method"));
  assert.ok(result.includes("requestable-status"));
  assert.ok(result.includes("on-response"));
  assert.ok(result.includes("on-request-error"));
  assert.ok(result.includes("on-click"), "native events stay available");
  assert.ok(!result.includes("requestable"), "the presence attribute is already there");
});

test("completion: a partial attribute name filters to its prefix", () => {
  const text = fixture("completion-on-prefix.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("on-c") + "on-c".length;
  const result = labels(analysis, offset);
  assert.ok(result.includes("on-click"));
  assert.ok(result.includes("on-copy"));
  assert.ok(!result.includes("on-input"));
  assert.ok(result.every((label) => label.startsWith("on-c")));
});

test("completion: inside a parameter list lists the event's fields", () => {
  const text = fixture("completion-fields.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("(  )") + "( ".length;
  assert.deepEqual(labels(analysis, offset), ["html", "status"]);
});

test("completion: an open parameter list still lists fields before the arrow is typed", () => {
  const text =
    '<script type="module" implementations="requestable" src="x"></script>\n' +
    '<div id="d" requestable on-response="(  )">x</div>';
  const analysis = analysisOf(text);
  const offset = text.indexOf("(  )") + "( ".length;
  assert.deepEqual(labels(analysis, offset), ["html", "status"]);
});

test("completion: a parameter field already used is not offered again", () => {
  const text =
    '<script type="module" implementations="requestable" src="x"></script>\n' +
    '<div id="d" requestable on-response="(status: 200,   ) => {  }">x</div>';
  const analysis = analysisOf(text);
  const offset = text.indexOf("(status: 200,   )") + "(status: 200, ".length;
  assert.deepEqual(labels(analysis, offset), ["html"]);
});

test("completion: inside a body lists the names bound by that handler", () => {
  const text = fixture("completion-bound.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("#out.set(  )") + "#out.set(  ".length;
  assert.deepEqual(labels(analysis, offset), ["html"]);
});

test("completion: a name bound by another handler is not offered", () => {
  const text = fixture("completion-bound-other-handler.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf("#out.set(  )") + "#out.set(  ".length;
  const result = labels(analysis, offset);
  assert.deepEqual(result, ["status"]);
  assert.ok(!result.includes("html"));
});

test("completion: the removed implementation-list attribute offers no value completions", () => {
  const text = fixture("legacy-implementation-list.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf('implements="') + 'implements="'.length;
  assert.equal(computeCompletions(analysis, analysis.document.positionAt(offset)), null);
});

test("completion: the bootstrap tag's implementations lists names not yet listed", () => {
  const text = fixture("completion-bootstrap-implementations.html");
  const analysis = analysisOf(text);
  const offset = text.indexOf('implementations="') + 'implementations="'.length;
  const result = labels(analysis, offset);
  assert.ok(!result.includes("modifiable"));
  assert.ok(result.includes("attributable"));
  assert.equal(result.length, vocabulary.names.length - 1);
});

test("completion: todo-list.html lists ids and verbs", () => {
  const text = siteExample("todo-list.html");
  const analysis = analysisOf(text);
  const hashOffset = text.indexOf("#todo-list") + 1;
  const ids = labels(analysis, hashOffset);
  assert.ok(ids.includes("todo-list"));
  assert.ok(ids.includes("todo-input"));

  const verbOffset = text.indexOf("#todo-list.render") + "#todo-list.".length;
  const item = completionsAt(analysis, verbOffset).find((candidate) => candidate.label === "render");
  assert.ok(item);
  assert.match(item.detail ?? "", /template/);
});
