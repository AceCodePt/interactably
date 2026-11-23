import "./dom-standins.ts";
import { CompletionItemKind } from "vscode-languageserver";
import type { CompletionItem, Position } from "vscode-languageserver";
import { INTERSECT_EVENT_NAMES } from "interactably";
import { attribute, decodeAttributeValue, isScriptElement } from "./html.ts";
import type { HtmlElement } from "./html.ts";
import { decodeHtml } from "./offsets.ts";
import { NATIVE_DOM_EVENTS } from "./native-events.ts";
import { handlerContextAt } from "./handler-context.ts";
import type { DocumentAnalysis } from "./analysis.ts";
import { eventSpecFor, eventTypeOf, presenceAttributeNames, presentImplementations } from "./analysis.ts";

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
    if (candidate.name.startsWith("on-") && candidate.name.length > 3) {
      return handlerCompletions(analysis, element, candidate, offset);
    }
    return null;
  }

  const tagNameEnd = element.start + 1 + element.tag.length;
  if (offset <= tagNameEnd) return null;
  const partial = partialAttributeName(analysis, element, offset);
  return attributeCompletions(analysis, element, partial);
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

function attributeCompletions(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  partial: string,
): CompletionItem[] {
  const present = presentImplementations(element, analysis.vocabulary);
  const presentNames = new Set(present.map((info) => info.name));
  const usedAttributes = new Set(element.attributes.map((candidate) => candidate.name));
  const items = new Map<string, CompletionItem>();

  const add = (item: CompletionItem): void => {
    if (!item.label.startsWith(partial)) return;
    if (usedAttributes.has(item.label)) return;
    if (items.has(item.label)) return;
    items.set(item.label, item);
  };

  for (const name of analysis.vocabulary.names) {
    if (presentNames.has(name)) continue;
    add({
      label: name,
      kind: CompletionItemKind.Property,
      detail: "built-in implementation",
      insertText: name,
      filterText: name,
      sortText: `1${name}`,
    });
  }

  for (const info of present) {
    for (const [attributeName, signature] of info.configAttributes) {
      add({
        label: attributeName,
        kind: CompletionItemKind.Property,
        detail: `${signature} (config of ${info.name})`,
        insertText: attributeName,
        filterText: attributeName,
        sortText: `0${attributeName}`,
      });
    }
    for (const [attributeName, signature] of info.stateAttributes) {
      add({
        label: attributeName,
        kind: CompletionItemKind.Property,
        detail: `${signature} (state of ${info.name})`,
        insertText: attributeName,
        filterText: attributeName,
        sortText: `0${attributeName}`,
      });
    }
  }

  for (const event of completableEvents(analysis, present.map((info) => info.name))) {
    const label = `on-${event}`;
    add({
      label,
      kind: CompletionItemKind.Event,
      detail: eventDetail(analysis, event),
      insertText: label,
      filterText: label,
      sortText: `2${label}`,
    });
  }

  return [...items.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function completableEvents(analysis: DocumentAnalysis, presentNames: readonly string[]): string[] {
  const events = new Set<string>();
  for (const event of NATIVE_DOM_EVENTS) events.add(event);
  for (const event of INTERSECT_EVENT_NAMES) events.add(event);
  for (const name of presentNames) {
    const info = analysis.vocabulary.byName.get(name);
    if (info === undefined) continue;
    for (const event of info.events) events.add(event);
  }
  return [...events].sort();
}

function eventDetail(analysis: DocumentAnalysis, event: string): string {
  const owner = analysis.vocabulary.eventOwners.get(event);
  if (owner !== undefined) return `event declared by ${owner}`;
  if (INTERSECT_EVENT_NAMES.has(event)) return "synthetic trigger";
  return "native DOM event";
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

function handlerCompletions(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  candidate: { readonly name: string; readonly value: string | null; readonly valueStart: number; readonly valueEnd: number },
  offset: Offset,
): CompletionItem[] | null {
  const eventType = eventTypeOf(candidate.name);
  if (eventType.includes("(")) return null;

  const decoded = decodeHtml(candidate.value ?? "");
  const decodedOffset = decodeHtml(
    analysis.text.slice(candidate.valueStart, Math.min(offset, candidate.valueEnd)),
  ).text.length;
  const context = handlerContextAt(decoded.text, decodedOffset);
  const prefix = decodeHtml(analysis.text.slice(candidate.valueStart, offset)).text;

  if (context?.kind === "parameter") {
    return fieldCompletions(analysis, element, eventType, context, decoded.text, decodedOffset);
  }

  const phrases = phraseCompletions(analysis, element, candidate.valueStart, offset);
  if (phrases !== null) return phrases;

  if (context?.kind === "body" && !insideString(prefix)) {
    const partial = identifierTail(decoded.text.slice(context.start, decodedOffset));
    const items = context.bound
      .filter((name) => name.startsWith(partial))
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort()
      .map((name) => ({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: "bound by this handler's parameter",
        insertText: name,
        filterText: name,
        sortText: name,
      }));
    if (items.length > 0) return items;
  }

  return null;
}

function fieldCompletions(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  eventType: string,
  context: { readonly start: number; readonly declared: readonly string[] },
  decoded: string,
  decodedOffset: Offset,
): CompletionItem[] | null {
  const spec = eventSpecFor(element, eventType, analysis.vocabulary);
  if (spec === undefined) return null;

  const partial = identifierTail(decoded.slice(context.start, decodedOffset));
  const declared = new Set(context.declared);
  return [...spec.fields]
    .filter(([name]) => !declared.has(name))
    .filter(([name]) => name.startsWith(partial))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, type]) => ({
      label: name,
      kind: CompletionItemKind.Field,
      detail: type,
      insertText: name,
      filterText: name,
      sortText: name,
    }));
}

function identifierTail(text: string): string {
  return /[A-Za-z0-9_$-]*$/.exec(text)?.[0] ?? "";
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
  const names = presenceAttributeNames(receiver, analysis.vocabulary);
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
