import { readFileSync } from "node:fs";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Diagnostic } from "vscode-languageserver";
import { loadVocabulary } from "../src/vocabulary.ts";
import { analyze } from "../src/analysis.ts";
import { computeDiagnostics } from "../src/diagnostics.ts";

export const vocabulary = loadVocabulary();

export function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function siteExample(name: string): string {
  return readFileSync(new URL(`../../../site/examples/${name}`, import.meta.url), "utf8");
}

export function documentFor(text: string): TextDocument {
  return TextDocument.create("file:///fixture.html", "html", 0, text);
}

export function diagnose(text: string): Diagnostic[] {
  return computeDiagnostics(analyze(text, vocabulary));
}

export function findByCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.code === code);
}

export function positionAfter(text: string, needle: string, skip = 0): { line: number; character: number } {
  const index = text.indexOf(needle);
  if (index === -1) throw new Error(`needle not found: ${needle}`);
  return documentFor(text).positionAt(index + skip);
}

export function substringOf(text: string, diagnostic: Diagnostic): string {
  const document = documentFor(text);
  return text.slice(document.offsetAt(diagnostic.range.start), document.offsetAt(diagnostic.range.end));
}
