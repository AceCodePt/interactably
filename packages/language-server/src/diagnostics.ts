import "./dom-standins.ts";
import { DiagnosticSeverity } from "vscode-languageserver";
import type { Diagnostic } from "vscode-languageserver";
import {
  INTERSECT_EVENT_NAMES,
  REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE,
  compileSignature,
  parseEventValueWithErrors,
} from "interactably";
import type { Arg, EventHandler, HandlerField, Ref, Unit } from "interactably";
import { attribute, isScriptElement, splitNames } from "./html.ts";
import type { HtmlAttribute, HtmlElement } from "./html.ts";
import { decodeHtml } from "./offsets.ts";
import { NATIVE_DOM_EVENTS } from "./native-events.ts";
import type { DocumentAnalysis, EventSpecInfo } from "./analysis.ts";
import { eventSpecFor, eventTypeOf, presenceAttributeNames } from "./analysis.ts";

export type DiagnosticCode =
  | "parse-error"
  | "unknown-verb"
  | "unknown-receiver"
  | "unknown-event"
  | "undeclared-implementation"
  | "unknown-implementation"
  | "missing-bootstrap"
  | "duplicate-id"
  | "duplicate-named-id"
  | "legacy-implementation-list"
  | "missing-event-owner"
  | "unknown-event-field"
  | "event-field-mismatch"
  | "unbound-name";

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
  reportIdUniqueness(analysis, add);

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
      const isUsage =
        !isScriptElement(element) && analysis.vocabulary.byName.has(candidate.name);
      if (!isTrigger && !isUsage) continue;
      add(
        candidate.nameStart,
        candidate.nameEnd,
        "This page uses Interactably attributes but has no bootstrap script, so nothing will attach. " +
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
    reportLegacyImplementationList(element, add);
    if (isScriptElement(element)) {
      reportUnknownDeclarations(analysis, element, add);
      continue;
    }
    reportUndeclaredUsages(analysis, element, add);
  }
}

function reportLegacyImplementationList(element: HtmlElement, add: Adder): void {
  const legacy = attribute(element, REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE);
  if (legacy === undefined) return;
  add(
    legacy.nameStart,
    legacy.nameEnd,
    "the implementation-list attribute is no longer supported; name each implementation as its own " +
      'attribute, for example "revealable"',
    "legacy-implementation-list",
    DiagnosticSeverity.Error,
  );
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
  for (const candidate of element.attributes) {
    if (!analysis.vocabulary.byName.has(candidate.name)) continue;
    if (analysis.declarations.has(candidate.name)) continue;
    add(
      candidate.nameStart,
      candidate.nameEnd,
      `"${candidate.name}" is used here but not declared by the bootstrap script's implementations attribute`,
      "undeclared-implementation",
      DiagnosticSeverity.Error,
    );
  }
}

function reportIdUniqueness(analysis: DocumentAnalysis, add: Adder): void {
  const nativeValues = new Map<string, { start: number; end: number }[]>();
  for (const occurrence of analysis.model.idOccurrences) {
    const occurrences = nativeValues.get(occurrence.value) ?? [];
    occurrences.push({ start: occurrence.valueStart, end: occurrence.valueEnd });
    nativeValues.set(occurrence.value, occurrences);
  }
  for (const [value, occurrences] of nativeValues) {
    if (occurrences.length < 2) continue;
    for (const occurrence of occurrences) {
      add(
        occurrence.start,
        occurrence.end,
        `duplicate id "${value}": another element in this document already carries it`,
        "duplicate-id",
        DiagnosticSeverity.Error,
      );
    }
  }

  const namedValues = new Map<string, Map<string, { start: number; end: number }[]>>();
  for (const element of analysis.model.elements) {
    for (const candidate of element.attributes) {
      if (candidate.name === "id" || !candidate.name.endsWith("-id") || candidate.value === null) continue;
      const perName = namedValues.get(candidate.name) ?? new Map<string, { start: number; end: number }[]>();
      const occurrences = perName.get(candidate.value) ?? [];
      occurrences.push({ start: candidate.valueStart, end: candidate.valueEnd });
      perName.set(candidate.value, occurrences);
      namedValues.set(candidate.name, perName);
    }
  }
  for (const [name, perName] of namedValues) {
    for (const [value, occurrences] of perName) {
      if (occurrences.length < 2) continue;
      for (const occurrence of occurrences) {
        add(
          occurrence.start,
          occurrence.end,
          `duplicate ${name} "${value}": another element in this document already carries it`,
          "duplicate-named-id",
          DiagnosticSeverity.Error,
        );
      }
    }
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
  const declaredEvent = eventTypeOf(attributeValue.name);
  if (declaredEvent.includes("(")) {
    add(
      attributeValue.nameStart,
      attributeValue.nameEnd,
      `event data now belongs in a handler parameter; write ${declaredEvent.slice(0, declaredEvent.indexOf("("))}="(name: type) => { … }"`,
      "parse-error",
      DiagnosticSeverity.Error,
    );
    return;
  }

  const eventType = declaredEvent;
  const spec = eventSpecFor(element, eventType, analysis.vocabulary);
  const owner = analysis.vocabulary.eventOwners.get(eventType);
  const presentNames = presenceAttributeNames(element, analysis.vocabulary);

  if (
    !NATIVE_DOM_EVENTS.has(eventType) &&
    !INTERSECT_EVENT_NAMES.has(eventType) &&
    owner !== undefined &&
    !presentNames.includes(owner)
  ) {
    add(
      attributeValue.nameStart,
      attributeValue.nameEnd,
      `on-${eventType} needs "${owner}" on this element; without it nothing owns the event`,
      "missing-event-owner",
      DiagnosticSeverity.Error,
    );
  }

  if (spec === undefined) {
    add(
      attributeValue.nameStart,
      attributeValue.nameEnd,
      `unknown event "${eventType}": it is not a native DOM event and no implementation declares it`,
      "unknown-event",
      DiagnosticSeverity.Warning,
    );
  }

  const raw = attributeValue.value ?? "";
  const decoded = decodeHtml(raw);
  const { handlers, errors } = parseEventValueWithErrors(decoded.text);
  const documentOffset = (offset: number): number => attributeValue.valueStart + decoded.toRaw(offset);

  for (const error of errors) {
    add(documentOffset(error.start), documentOffset(error.end), error.message, "parse-error", DiagnosticSeverity.Error);
  }

  for (const handler of handlers) {
    reportHandlerFields(eventType, spec, handler, documentOffset, add);
    for (const phrase of handler.phrases) {
      for (const unit of phrase.units) {
        reportUnit(analysis, element, unit, documentOffset, add);
      }
    }
  }
}

function reportHandlerFields(
  eventType: string,
  spec: EventSpecInfo | undefined,
  handler: EventHandler,
  documentOffset: (offset: number) => number,
  add: Adder,
): void {
  const bound = new Set<string>();

  for (const field of handler.parameter.fields) {
    const start = documentOffset(field.start);
    const end = documentOffset(field.end);

    const fieldType = spec?.fields.get(field.name);
    if (spec !== undefined && !spec.open && fieldType === undefined) {
      add(
        start,
        end,
        `"${field.name}" is not a field of event "${eventType}"; allowed fields: ${describeFields(spec)}`,
        "unknown-event-field",
        DiagnosticSeverity.Error,
      );
      continue;
    }

    if (field.kind === "literal") {
      if (fieldType !== undefined && !literalFits(fieldType, field.value)) {
        add(
          start,
          end,
          `${describeLiteral(field.value)} does not match "${field.name}", declared ${fieldType}`,
          "event-field-mismatch",
          DiagnosticSeverity.Error,
        );
      }
      continue;
    }

    if (!validType(field)) {
      add(
        start,
        end,
        `"${field.type}" is not a valid value type for "${field.name}"`,
        "event-field-mismatch",
        DiagnosticSeverity.Error,
      );
      continue;
    }
    if (fieldType !== undefined && !typesOverlap(fieldType, field.type)) {
      add(
        start,
        end,
        `"${field.type}" does not overlap "${field.name}", declared ${fieldType}`,
        "event-field-mismatch",
        DiagnosticSeverity.Error,
      );
      continue;
    }
    bound.add(field.name);
  }

  for (const phrase of handler.phrases) {
    for (const unit of phrase.units) {
      for (const call of unit.calls) {
        for (const name of namesInArg(call.arg)) {
          if (bound.has(name.name)) continue;
          add(
            documentOffset(name.start),
            documentOffset(name.end),
            `"${name.name}" is not bound by this handler; declare it in the parameter, for example (${name.name}: string)`,
            "unbound-name",
            DiagnosticSeverity.Error,
          );
        }
      }
    }
  }
}

function describeFields(spec: EventSpecInfo): string {
  if (spec.fields.size === 0) return "(none)";
  return [...spec.fields.keys()].sort().join(", ");
}

const NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/;
const STRING_UNION = /^'[^']*'$/;

function validType(field: HandlerField): boolean {
  if (field.kind !== "type") return true;
  try {
    compileSignature(field.type);
    return true;
  } catch {
    return false;
  }
}

function literalFits(fieldType: string, literal: string | number | boolean): boolean {
  try {
    compileSignature(fieldType).validate(literal);
    return true;
  } catch {
    return false;
  }
}

function describeLiteral(literal: string | number | boolean): string {
  return typeof literal === "string" ? `'${literal}'` : String(literal);
}

function typeKinds(type: string): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const raw of type.split("|")) {
    const part = raw.trim();
    if (part === "string") kinds.add("string");
    else if (part === "number") kinds.add("number");
    else if (part === "boolean") kinds.add("boolean");
    else if (NUMBER_LITERAL.test(part)) kinds.add("number");
    else if (STRING_UNION.test(part)) kinds.add("string");
    else if (part === "true" || part === "false") kinds.add("boolean");
  }
  return kinds;
}

function typesOverlap(fieldType: string, declaredType: string): boolean {
  const fieldKinds = typeKinds(fieldType);
  const declaredKinds = typeKinds(declaredType);
  if (fieldKinds.size === 0 || declaredKinds.size === 0) return true;
  for (const kind of declaredKinds) if (fieldKinds.has(kind)) return true;
  return false;
}

interface NamedArg {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

function namesInArg(arg: Arg | undefined): NamedArg[] {
  if (arg === undefined) return [];
  switch (arg.kind) {
    case "name":
      return [{ name: arg.name, start: arg.start, end: arg.end }];
    case "object":
      return arg.fields.flatMap((field) => namesInArg(field.value));
    default:
      return [];
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
  const verbs = new Set<string>();
  for (const name of presenceAttributeNames(receiver, analysis.vocabulary)) {
    const info = analysis.vocabulary.byName.get(name);
    if (info === undefined) return null;
    for (const verb of info.verbs.keys()) verbs.add(verb);
  }
  return verbs;
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
