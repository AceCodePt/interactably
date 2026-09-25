import "./dom-standins.ts";
import { CompletionItemKind } from "vscode-languageserver";
import type { CompletionItem, Position } from "vscode-languageserver";
import { INTERSECT_EVENT_NAMES } from "interactably";
import { attribute, decodeAttributeValue, isScriptElement } from "./html.ts";
import type { HtmlElement } from "./html.ts";
import { decodeHtml } from "./offsets.ts";
import { NATIVE_DOM_EVENTS } from "./native-events.ts";
import type { DocumentAnalysis } from "./analysis.ts";

type Offset = number;

export function computeCompletions(
  analysis: DocumentAnalysis,
  position: Position,
): CompletionItem[] | null {
  const offset = analysis.document.offsetAt(position);
  const element = elementContaining(analysis, offset);
  if (element === undefined) return null;

  for (const candidate of element.attributes) {
    if (candidate.value === null) continue;
    if (offset < candidate.valueStart || offset > candidate.valueEnd) continue;
    if (candidate.name === "implementations" && isScriptElement(element)) {
      return declarationCompletions(analysis, element, candidate.valueStart, offset);
    }
    if (candidate.name === "implements" && !isScriptElement(element)) {
      return usageCompletions(analysis, candidate.valueStart, offset);
    }
    if (candidate.name.startsWith("on-") && candidate.name.length > 3) {
      return phraseCompletions(analysis, element, candidate.valueStart, offset);
    }
    return null;
  }

  const tagNameEnd = element.start + 1 + element.tag.length;
  if (offset <= tagNameEnd) return null;
  const partial = partialAttributeName(analysis, element, offset);
  if (partial !== "" && !partial.startsWith("on-")) return null;
  return eventCompletions(analysis, partial);
}

function elementContaining(analysis: DocumentAnalysis, offset: Offset): HtmlElement | undefined {
  for (const element of analysis.model.elements) {
    if (offset >= element.start && offset <= element.startTagEnd) return element;
  }
  return undefined;
}

function partialAttributeName(analysis: DocumentAnalysis, element: HtmlElement, offset: Offset): string {
  for (const candidate of element.attributes) {
    if (offset >= candidate.nameStart && offset <= candidate.nameEnd) {
      return analysis.text.slice(candidate.nameStart, offset);
    }
  }
  const tagNameEnd = element.start + 1 + element.tag.length;
  let start = offset;
  while (start > tagNameEnd && isAttributeNameCharacter(analysis.text[start - 1])) start -= 1;
  return analysis.text.slice(start, offset);
}

function isAttributeNameCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  return !/\s/.test(character) && character !== "=" && character !== "/" && character !== ">" && character !== "<";
}

function eventCompletions(analysis: DocumentAnalysis, partial: string): CompletionItem[] {
  const events = new Set<string>();
  for (const event of NATIVE_DOM_EVENTS) events.add(event);
  for (const event of INTERSECT_EVENT_NAMES) events.add(event);
  for (const event of analysis.eventNames) events.add(event);
  const prefix = partial.startsWith("on-") ? partial : "";
  return [...events]
    .sort()
    .map((event) => `on-${event}`)
    .filter((label) => label.startsWith(prefix))
    .map((label) => ({
      label,
      kind: CompletionItemKind.Property,
      insertText: label,
      filterText: label,
      sortText: label,
    }));
}

function declarationCompletions(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  valueStart: Offset,
  offset: Offset,
): CompletionItem[] {
  const typed = decodeHtml(analysis.text.slice(valueStart, offset)).text;
  const currentWord = /\S+$/.exec(typed)?.[0] ?? "";
  const decodedValue = decodeAttributeValue(attribute(element, "implementations")?.value ?? "");
  const listed = new Set(decodedValue.split(/\s+/).filter((name) => name !== ""));

  const items: CompletionItem[] = [];
  for (const name of analysis.vocabulary.names) {
    if (listed.has(name)) continue;
    if (currentWord !== "" && !name.startsWith(currentWord)) continue;
    items.push({
      label: name,
      kind: CompletionItemKind.Interface,
      detail: "built-in implementation",
      insertText: name,
      filterText: name,
      sortText: name,
    });
  }
  items.sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
  return items;
}

function usageCompletions(
  analysis: DocumentAnalysis,
  valueStart: Offset,
  offset: Offset,
): CompletionItem[] {
  const typed = decodeHtml(analysis.text.slice(valueStart, offset)).text;
  const currentWord = /\S+$/.exec(typed)?.[0] ?? "";

  const items: CompletionItem[] = [];
  for (const name of analysis.vocabulary.names) {
    if (currentWord !== "" && !name.startsWith(currentWord)) continue;
    const declared = analysis.declarations.has(name);
    items.push({
      label: name,
      kind: CompletionItemKind.Interface,
      detail: declared
        ? "declared by the bootstrap script"
        : "not declared by the bootstrap script; this element will not attach",
      insertText: name,
      filterText: name,
      sortText: `${declared ? "0" : "1"}${name}`,
    });
  }
  items.sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
  return items;
}

function phraseCompletions(
  analysis: DocumentAnalysis,
  source: HtmlElement,
  valueStart: Offset,
  offset: Offset,
): CompletionItem[] | null {
  const prefix = decodeHtml(analysis.text.slice(valueStart, offset)).text;
  if (insideString(prefix)) return null;

  const receiver = /(#([^\s,;.()&|{}:'"#]+)|this)\.$/.exec(prefix);
  if (receiver !== null) {
    const receiverElement = receiver[1] === "this" ? source : analysis.model.byId.get(receiver[2]!);
    if (receiverElement === undefined) return null;
    return verbCompletions(analysis, receiverElement);
  }

  const id = /(?:^|[^\w#-])#([^\s,;.()&|{}:'"#]*)$/.exec(prefix);
  if (id !== null) {
    const partial = id[1]!;
    return [...analysis.model.ids]
      .sort()
      .filter((value) => value.startsWith(partial))
      .map((value) => ({
        label: value,
        kind: CompletionItemKind.Reference,
        detail: "id in this document",
        insertText: value,
        filterText: value,
        sortText: value,
      }));
  }

  return null;
}

function verbCompletions(analysis: DocumentAnalysis, receiver: HtmlElement): CompletionItem[] {
  const names = implementationNames(receiver);
  const items = new Map<string, CompletionItem>();
  for (const name of names) {
    const info = analysis.vocabulary.byName.get(name);
    if (info === undefined) continue;
    for (const [verb, signature] of info.verbs) {
      if (items.has(verb)) continue;
      items.set(verb, {
        label: verb,
        kind: CompletionItemKind.Method,
        detail: signature,
        insertText: verb,
        filterText: verb,
        sortText: verb,
      });
    }
  }
  return [...items.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function implementationNames(element: HtmlElement): string[] {
  const value = attribute(element, "implements")?.value ?? null;
  if (value === null) return [];
  return decodeAttributeValue(value).split(/\s+/).filter((name) => name !== "");
}

function insideString(prefix: string): boolean {
  let quoted = false;
  for (let index = 0; index < prefix.length; index++) {
    const character = prefix[index]!;
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "'") quoted = !quoted;
  }
  return quoted;
}
