import { TextDocument } from "vscode-languageserver-textdocument";
import { attribute, isScriptElement, parseHtml } from "./html.ts";
import type { HtmlDocumentModel, HtmlElement } from "./html.ts";
import type { Vocabulary } from "./vocabulary.ts";

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

export function isBootstrapTag(element: HtmlElement): boolean {
  return isScriptElement(element) && attribute(element, "implementations") !== undefined;
}

export function implementationNamesOf(element: HtmlElement): string[] {
  const name = isScriptElement(element) ? "implementations" : "implements";
  const value = attribute(element, name);
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
    for (const name of implementationNamesOf(element)) declarations.add(name);
  }

  const referencedBuiltins = new Set<string>();
  for (const name of declarations) if (vocabulary.byName.has(name)) referencedBuiltins.add(name);
  for (const element of model.elements) {
    if (isScriptElement(element)) continue;
    for (const name of implementationNamesOf(element)) {
      if (vocabulary.byName.has(name)) referencedBuiltins.add(name);
    }
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
