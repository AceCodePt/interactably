import "./dom-standins.ts";
import { DiagnosticSeverity } from "vscode-languageserver";
import type { Diagnostic } from "vscode-languageserver";
import { INTERSECT_EVENT_NAMES, parseEventAttribute, parseWithErrors } from "interactably";
import type { Arg, Ref, Unit } from "interactably";
import { attribute, attributeValue, decodeAttributeValue, isScriptElement, splitNames } from "./html.ts";
import type { HtmlAttribute, HtmlElement } from "./html.ts";
import { decodeHtml } from "./offsets.ts";
import { NATIVE_DOM_EVENTS } from "./native-events.ts";
import type { DocumentAnalysis } from "./analysis.ts";

export type DiagnosticCode =
  | "parse-error"
  | "unknown-verb"
  | "unknown-receiver"
  | "unknown-event"
  | "undeclared-implementation"
  | "unknown-implementation"
  | "missing-bootstrap";

interface PendingDiagnostic {
  readonly start: number;
  readonly end: number;
  readonly diagnostic: Diagnostic;
}

export function computeDiagnostics(analysis: DocumentAnalysis): Diagnostic[] {
  const pending: PendingDiagnostic[] = [];

  const add = (
    start: number,
    end: number,
    message: string,
    code: DiagnosticCode,
    severity: DiagnosticSeverity,
  ): void => {
    const length = analysis.text.length;
    const safeStart = Math.max(0, Math.min(start, length));
    const safeEnd = Math.max(safeStart, Math.min(end, length));
    pending.push({
      start: safeStart,
      end: safeEnd,
      diagnostic: {
        range: {
          start: analysis.document.positionAt(safeStart),
          end: analysis.document.positionAt(safeEnd),
        },
        message,
        code,
        source: "interactably",
        severity,
      },
    });
  };

  reportMissingBootstrap(analysis, add);
  reportImplementations(analysis, add);
  for (const element of analysis.model.elements) {
    reportElementTriggers(analysis, element, add);
  }

  pending.sort((a, b) => a.start - b.start || a.end - b.end);
  return pending.map((item) => item.diagnostic);
}

type Adder = (
  start: number,
  end: number,
  message: string,
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
) => void;

function reportMissingBootstrap(analysis: DocumentAnalysis, add: Adder): void {
  if (analysis.hasBootstrap) return;
  for (const element of analysis.model.elements) {
    for (const candidate of element.attributes) {
      const isTrigger = candidate.name.startsWith("on-") && candidate.name.length > 3;
      const isUsage = candidate.name === "implements" && !isScriptElement(element);
      if (!isTrigger && !isUsage) continue;
      add(
        candidate.nameStart,
        candidate.nameEnd,
        "This page uses Interactably phrases but has no bootstrap script, so nothing will attach. " +
          'Add a <script type="module" implementations="..."> that loads the Interactably bootstrap.',
        "missing-bootstrap",
        DiagnosticSeverity.Information,
      );
      return;
    }
  }
}

function reportImplementations(analysis: DocumentAnalysis, add: Adder): void {
  for (const element of analysis.model.elements) {
    if (isScriptElement(element)) {
      reportUnknownDeclarations(analysis, element, add);
      continue;
    }
    reportUndeclaredUsages(analysis, element, add);
  }
}

function reportUnknownDeclarations(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  add: Adder,
): void {
  const implementationsAttribute = attribute(element, "implementations");
  if (implementationsAttribute === undefined || implementationsAttribute.value === null) return;
  const decoded = decodeHtml(implementationsAttribute.value);
  for (const span of splitNames(decoded.text)) {
    if (analysis.vocabulary.byName.has(span.name)) continue;
    add(
      offsetIn(implementationsAttribute, decoded.toRaw(span.start)),
      offsetIn(implementationsAttribute, decoded.toRaw(span.end)),
      `"${span.name}" is not a built-in implementation`,
      "unknown-implementation",
      DiagnosticSeverity.Error,
    );
  }
}

function reportUndeclaredUsages(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  add: Adder,
): void {
  if (!analysis.hasBootstrap) return;
  const implementsAttribute = attribute(element, "implements");
  if (implementsAttribute === undefined || implementsAttribute.value === null) return;
  const decoded = decodeHtml(implementsAttribute.value);
  for (const span of splitNames(decoded.text)) {
    if (analysis.declarations.has(span.name)) continue;
    add(
      offsetIn(implementsAttribute, decoded.toRaw(span.start)),
      offsetIn(implementsAttribute, decoded.toRaw(span.end)),
      `"${span.name}" is used here but not declared by the bootstrap script's implementations attribute`,
      "undeclared-implementation",
      DiagnosticSeverity.Error,
    );
  }
}

function offsetIn(attributeValue: HtmlAttribute, decodedOffset: number): number {
  return attributeValue.valueStart + decodedOffset;
}

function reportElementTriggers(analysis: DocumentAnalysis, element: HtmlElement, add: Adder): void {
  for (const candidate of element.attributes) {
    if (!candidate.name.startsWith("on-") || candidate.name.length <= 3) continue;
    reportTrigger(analysis, element, candidate, add);
  }
}

function reportTrigger(
  analysis: DocumentAnalysis,
  element: HtmlElement,
  attributeValue: HtmlAttribute,
  add: Adder,
): void {
  const declaredEvent = attributeValue.name.slice(3);
  let eventType = declaredEvent;
  try {
    eventType = parseEventAttribute(declaredEvent).type;
  } catch (error) {
    add(
      attributeValue.nameStart,
      attributeValue.nameEnd,
      (error as Error).message,
      "parse-error",
      DiagnosticSeverity.Error,
    );
    return;
  }

  const knownEvent =
    NATIVE_DOM_EVENTS.has(eventType) ||
    INTERSECT_EVENT_NAMES.has(eventType) ||
    analysis.eventNames.has(eventType);
  if (!knownEvent) {
    add(
      attributeValue.nameStart,
      attributeValue.nameEnd,
      `unknown event "${eventType}": it is not a native DOM event and no implementation on this page declares it`,
      "unknown-event",
      DiagnosticSeverity.Warning,
    );
  }

  const raw = attributeValue.value ?? "";
  const decoded = decodeHtml(raw);
  const { phrases, errors } = parseWithErrors(decoded.text, eventType);
  const documentOffset = (offset: number): number => attributeValue.valueStart + decoded.toRaw(offset);

  for (const error of errors) {
    add(documentOffset(error.start), documentOffset(error.end), error.message, "parse-error", DiagnosticSeverity.Error);
  }

  for (const phrase of phrases) {
    for (const unit of phrase.units) {
      reportUnit(analysis, element, unit, documentOffset, add);
    }
  }
}

function reportUnit(
  analysis: DocumentAnalysis,
  source: HtmlElement,
  unit: Unit,
  documentOffset: (offset: number) => number,
  add: Adder,
): void {
  let receiverUnknown = false;
  if (unit.ref.kind === "id") {
    if (!analysis.model.ids.has(unit.ref.id)) {
      receiverUnknown = true;
      reportUnknownReceiver(unit.ref, unit.ref.id, documentOffset, add);
    }
  }

  const verbs = receiverUnknown ? null : verbsFor(analysis, source, unit.ref);
  if (verbs !== null) {
    for (const call of unit.calls) {
      if (verbs.has(call.verb)) continue;
      add(
        documentOffset(call.start),
        documentOffset(call.end),
        `unknown verb "${call.verb}()" for ${describeRef(unit.ref)}; ` +
          (verbs.size === 0
            ? "it declares no implementation that provides verbs"
            : `available verbs: ${[...verbs.keys()].sort().join(", ")}`),
        "unknown-verb",
        DiagnosticSeverity.Error,
      );
    }
  }

  for (const call of unit.calls) {
    for (const ref of refsInArg(call.arg)) {
      if (ref.kind !== "id") continue;
      if (analysis.model.ids.has(ref.id)) continue;
      reportUnknownReceiver(ref, ref.id, documentOffset, add);
    }
  }
}

function reportUnknownReceiver(
  ref: Ref,
  id: string,
  documentOffset: (offset: number) => number,
  add: Adder,
): void {
  add(
    documentOffset(ref.start),
    documentOffset(ref.end),
    `unknown receiver "#${id}": no element in the document carries that id`,
    "unknown-receiver",
    DiagnosticSeverity.Error,
  );
}

function verbsFor(analysis: DocumentAnalysis, source: HtmlElement, ref: Ref): ReadonlySet<string> | null {
  const receiver = ref.kind === "this" ? source : analysis.model.byId.get(ref.id);
  if (receiver === undefined) return null;
  const names = elementImplementationNames(receiver);
  const verbs = new Set<string>();
  for (const name of names) {
    const info = analysis.vocabulary.byName.get(name);
    if (info === undefined) return null;
    for (const verb of info.verbs.keys()) verbs.add(verb);
  }
  return verbs;
}

function elementImplementationNames(element: HtmlElement): string[] {
  const value = attributeValue(element, "implements");
  if (value === undefined || value === null) return [];
  return decodeAttributeValue(value).split(/\s+/).filter((name) => name !== "");
}

function describeRef(ref: Ref): string {
  return ref.kind === "this" ? "this" : `#${ref.id}`;
}

function refsInArg(arg: Arg | undefined): Ref[] {
  if (arg === undefined) return [];
  switch (arg.kind) {
    case "ref":
      return [arg.ref];
    case "read":
      return [arg.ref];
    case "object":
      return arg.fields.flatMap((field) => refsInArg(field.value));
    default:
      return [];
  }
}
