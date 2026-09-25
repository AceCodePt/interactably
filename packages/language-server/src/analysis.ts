import { TextDocument } from "vscode-languageserver-textdocument";
import { attribute, attributeValue, isScriptElement, parseHtml } from "./html.ts";
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

const CDN_PREFIXES = [
  "https://cdn.jsdelivr.net/npm/",
  "https://esm.run/",
  "https://unpkg.com/",
  "https://esm.unpkg.com/",
  "https://esm.sh/",
];

export function isRecognisedBootstrapSrc(src: string): boolean {
  const bare = src.split(/[?#]/, 1)[0]!.trim();
  if (bare === "") return false;
  if (bare.includes("skypack")) return false;
  for (const prefix of CDN_PREFIXES) {
    if (!bare.startsWith(prefix)) continue;
    const remainder = bare.slice(prefix.length);
    const packageName = remainder.split("/", 1)[0]!;
    return packageName === "interactably" || packageName.startsWith("interactably@");
  }
  return (
    /(?:^|\/)node_modules\/interactably(?:\/|$)/.test(bare) ||
    /(?:^|\/)dist\/cdn(?:\/|$)/.test(bare)
  );
}

export function isBootstrapTag(element: HtmlElement): boolean {
  if (!isScriptElement(element)) return false;
  const implementsAttribute = attribute(element, "implements");
  if (implementsAttribute !== undefined) return true;
  const type = attributeValue(element, "type");
  const src = attributeValue(element, "src") ?? "";
  return type === "module" && isRecognisedBootstrapSrc(src);
}

export function implementationNamesOf(element: HtmlElement): string[] {
  const names: string[] = [];
  const implementsAttribute = attribute(element, "implements");
  if (implementsAttribute === undefined || implementsAttribute.value === null) return names;
  for (const piece of implementsAttribute.value.split(/\s+/)) {
    if (piece !== "") names.push(piece);
  }
  return names;
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
