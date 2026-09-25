import { getLanguageService } from "vscode-html-languageservice";
import { TokenType } from "vscode-html-languageservice/lib/umd/htmlLanguageTypes.js";
import { decodeHtml } from "./offsets.ts";

export interface HtmlAttribute {
  readonly name: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly value: string | null;
  readonly valueStart: number;
  readonly valueEnd: number;
}

export interface HtmlElement {
  readonly tag: string;
  readonly start: number;
  readonly startTagEnd: number;
  readonly attributes: readonly HtmlAttribute[];
}

export interface HtmlDocumentModel {
  readonly elements: readonly HtmlElement[];
  readonly ids: ReadonlySet<string>;
  readonly byId: ReadonlyMap<string, HtmlElement>;
}

const languageService = getLanguageService();

export function parseHtml(text: string): HtmlDocumentModel {
  const scanner = languageService.createScanner(text);
  const elements: HtmlElement[] = [];
  const byId = new Map<string, HtmlElement>();
  let tag: string | null = null;
  let tagStart = 0;
  let tagOpenStart = 0;
  let attributes: HtmlAttribute[] = [];
  let pendingName: { name: string; nameStart: number; nameEnd: number } | null = null;

  for (let token = scanner.scan(); token !== TokenType.EOS; token = scanner.scan()) {
    switch (token) {
      case TokenType.StartTagOpen: {
        tagOpenStart = scanner.getTokenOffset();
        break;
      }
      case TokenType.StartTag: {
        tag = scanner.getTokenText();
        tagStart = tagOpenStart;
        attributes = [];
        pendingName = null;
        break;
      }
      case TokenType.AttributeName: {
        if (pendingName !== null) {
          attributes.push({ ...pendingName, value: null, valueStart: pendingName.nameEnd, valueEnd: pendingName.nameEnd });
        }
        const nameStart = scanner.getTokenOffset();
        pendingName = {
          name: scanner.getTokenText(),
          nameStart,
          nameEnd: nameStart + scanner.getTokenLength(),
        };
        break;
      }
      case TokenType.AttributeValue: {
        if (pendingName !== null) {
          const raw = scanner.getTokenText();
          const offset = scanner.getTokenOffset();
          const quoted =
            raw.length >= 2 &&
            ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
          const value = quoted ? raw.slice(1, -1) : raw;
          attributes.push({
            name: pendingName.name,
            nameStart: pendingName.nameStart,
            nameEnd: pendingName.nameEnd,
            value,
            valueStart: quoted ? offset + 1 : offset,
            valueEnd: quoted ? offset + raw.length - 1 : offset + raw.length,
          });
          pendingName = null;
        }
        break;
      }
      case TokenType.StartTagClose:
      case TokenType.StartTagSelfClose: {
        if (pendingName !== null) {
          attributes.push({ ...pendingName, value: null, valueStart: pendingName.nameEnd, valueEnd: pendingName.nameEnd });
          pendingName = null;
        }
        if (tag !== null) {
          const startTagEnd = scanner.getTokenOffset() + scanner.getTokenLength();
          const element: HtmlElement = { tag, start: tagStart, startTagEnd, attributes };
          elements.push(element);
          for (const attribute of attributes) {
            if (attribute.name === "id" && attribute.value !== null && attribute.value !== "") {
              if (!byId.has(attribute.value)) byId.set(attribute.value, element);
            }
          }
        }
        tag = null;
        attributes = [];
        pendingName = null;
        break;
      }
      default:
        break;
    }
  }

  return { elements, ids: new Set(byId.keys()), byId };
}

export function attribute(element: HtmlElement, name: string): HtmlAttribute | undefined {
  return element.attributes.find((candidate) => candidate.name === name);
}

export function isScriptElement(element: HtmlElement): boolean {
  return element.tag.toLowerCase() === "script";
}

export function attributeValue(element: HtmlElement, name: string): string | null | undefined {
  return attribute(element, name)?.value;
}

export interface NameSpan {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

export function decodeAttributeValue(rawValue: string): string {
  return decodeHtml(rawValue).text;
}

export function splitNames(decodedValue: string): NameSpan[] {
  const names: NameSpan[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(decodedValue);
  while (match !== null) {
    names.push({ name: match[0], start: match.index, end: match.index + match[0].length });
    match = pattern.exec(decodedValue);
  }
  return names;
}
