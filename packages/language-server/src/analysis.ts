import "./dom-standins.ts";
import { TextDocument } from "vscode-languageserver-textdocument";
import { INTERSECT_EVENT_FIELDS, INTERSECT_EVENT_NAMES, KEYBOARD_EVENT_FIELDS } from "interactably";
import { attribute, isScriptElement, parseHtml } from "./html.ts";
import type { HtmlDocumentModel, HtmlElement } from "./html.ts";
import { NATIVE_DOM_EVENTS } from "./native-events.ts";
import type { ImplementationInfo, Vocabulary } from "./vocabulary.ts";

export interface DocumentAnalysis {
  readonly document: TextDocument;
  readonly text: string;
  readonly model: HtmlDocumentModel;
  readonly vocabulary: Vocabulary;
  readonly bootstrapElements: readonly HtmlElement[];
  readonly hasBootstrap: boolean;
  readonly declarations: ReadonlySet<string>;
  readonly referencedBuiltins: ReadonlySet<string>;
  readonly eventNames: ReadonlySet<string>;
}

export interface EventSpecInfo {
  readonly fields: ReadonlyMap<string, string>;
  readonly open: boolean;
  readonly owner: string | undefined;
}

export function isBootstrapTag(element: HtmlElement): boolean {
  return isScriptElement(element) && attribute(element, "implementations") !== undefined;
}

export function presenceAttributeNames(
  element: HtmlElement,
  vocabulary: Vocabulary,
): string[] {
  const names: string[] = [];
  for (const candidate of element.attributes) {
    if (vocabulary.byName.has(candidate.name)) names.push(candidate.name);
  }
  return names;
}

export function presentImplementations(
  element: HtmlElement,
  vocabulary: Vocabulary,
): ImplementationInfo[] {
  const infos: ImplementationInfo[] = [];
  for (const name of presenceAttributeNames(element, vocabulary)) {
    const info = vocabulary.byName.get(name);
    if (info !== undefined) infos.push(info);
  }
  return infos;
}

export function eventTypeOf(attributeName: string): string {
  return attributeName.slice(3);
}

export function eventSpecFor(
  element: HtmlElement,
  eventType: string,
  vocabulary: Vocabulary,
): EventSpecInfo | undefined {
  const keyboard = KEYBOARD_EVENT_FIELDS[eventType];
  if (keyboard !== undefined) {
    return { fields: new Map(Object.entries(keyboard)), open: false, owner: undefined };
  }
  if (INTERSECT_EVENT_NAMES.has(eventType)) {
    return { fields: new Map(Object.entries(INTERSECT_EVENT_FIELDS)), open: false, owner: undefined };
  }

  const owner = vocabulary.eventOwners.get(eventType);
  const present = owner !== undefined && presenceAttributeNames(element, vocabulary).includes(owner);
  if (owner !== undefined && present) {
    const spec = vocabulary.byName.get(owner)?.eventInfo.get(eventType);
    if (spec !== undefined) return { ...spec, owner };
  }
  if (NATIVE_DOM_EVENTS.has(eventType)) {
    return { fields: new Map(), open: false, owner: undefined };
  }
  if (owner !== undefined) {
    const spec = vocabulary.byName.get(owner)?.eventInfo.get(eventType);
    if (spec !== undefined) return { ...spec, owner };
  }
  return undefined;
}

function declaredNames(element: HtmlElement): string[] {
  const value = attribute(element, "implementations");
  if (value === undefined || value.value === null) return [];
  return value.value.split(/\s+/).filter((piece) => piece !== "");
}

export function analyze(text: string, vocabulary: Vocabulary): DocumentAnalysis {
  const model = parseHtml(text);
  const document = TextDocument.create("file:///interactably.html", "html", 0, text);
  const bootstrapElements = model.elements.filter(isBootstrapTag);

  const declarations = new Set<string>();
  for (const element of model.elements) {
    if (!isScriptElement(element)) continue;
    for (const name of declaredNames(element)) declarations.add(name);
  }

  const referencedBuiltins = new Set<string>();
  for (const name of declarations) if (vocabulary.byName.has(name)) referencedBuiltins.add(name);
  for (const element of model.elements) {
    if (isScriptElement(element)) continue;
    for (const name of presenceAttributeNames(element, vocabulary)) referencedBuiltins.add(name);
  }

  const eventNames = new Set<string>();
  for (const name of referencedBuiltins) {
    const info = vocabulary.byName.get(name);
    if (info === undefined) continue;
    for (const event of info.events) eventNames.add(event);
  }

  return {
    document,
    text,
    model,
    vocabulary,
    bootstrapElements,
    hasBootstrap: bootstrapElements.length > 0,
    declarations,
    referencedBuiltins,
    eventNames,
  };
}
