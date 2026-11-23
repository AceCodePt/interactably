import { parseFormula } from "@utils/formula.ts";

export interface Span {
  start: number;
  end: number;
}

type Located<T> = T & Span;

function located<T extends object>(node: T, start: number, end: number): Located<T> {
  Object.defineProperty(node, "start", { value: start, enumerable: false });
  Object.defineProperty(node, "end", { value: end, enumerable: false });
  return node as Located<T>;
}

type RefBase = { kind: "id"; id: string } | { kind: "this" };

export type Ref = RefBase & Span;

export const READABLE_PROPERTIES = ["value", "checked", "min", "max", "step"] as const;

export type ReadProperty = (typeof READABLE_PROPERTIES)[number];

type ArgBase =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "ref"; ref: Ref }
  | { kind: "read"; ref: Ref; property: ReadProperty }
  | { kind: "name"; name: string }
  | { kind: "expr"; source: string; position: number }
  | { kind: "object"; fields: ReadonlyArray<{ name: string; value: Arg }> };

export type Arg = ArgBase & Span;

export type RefOrRead =
  | { kind: "ref"; ref: Ref }
  | { kind: "read"; ref: Ref; property: ReadProperty };

type CallBase = { verb: string; arg?: Arg };

export type Call = CallBase & Span;

type ModifierBase =
  | { kind: "debounce"; ms: number; position: number }
  | { kind: "throttle"; ms: number; position: number }
  | { kind: "once"; position: number }
  | { kind: "delay"; ms: number; position: number };

export type Modifier = ModifierBase & Span;

type UnitBase = { ref: Ref; calls: Call[]; modifiers: Modifier[] };

export type Unit = UnitBase & Span;

interface PhraseBase {
  units: Unit[];
  operator?: "&&" | "||";
}

export type Phrase = PhraseBase & Span;

export class ParseError extends Error {
  readonly start: number;
  readonly end: number;
  readonly phrase: string;

  constructor(message: string, start: number, end: number, phrase = "") {
    super(message);
    this.name = "ParseError";
    this.start = start;
    this.end = end;
    this.phrase = phrase;
  }
}

export interface ParseResult {
  phrases: Phrase[];
  errors: ParseError[];
}

export type HandlerLiteral = string | number | boolean;

type HandlerFieldBase = { name: string };

export type HandlerField =
  | (HandlerFieldBase & { kind: "literal"; value: HandlerLiteral })
  | (HandlerFieldBase & { kind: "type"; type: string });

export type LocatedHandlerField = HandlerField & Span;

export interface HandlerParameter extends Span {
  fields: LocatedHandlerField[];
}

export interface EventHandler extends Span {
  parameter: HandlerParameter;
  phrases: Phrase[];
}

export interface EventValueResult {
  handlers: EventHandler[];
  errors: ParseError[];
}

const CALL = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*)\)$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const STRING = /^'([^']*)'$/;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const HYPHENATED_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;
const ID = /^[^\s,;.()&|{}:'"#]+$/;
const TIMING = /^(debounce|throttle|delay)\(([^)]*)\)$/;
const READ = /^(this|#[^\s,;.()]+)\.([A-Za-z_$][A-Za-z0-9_$]*)$/;
const WHITESPACE = /\s/;

interface Piece {
  text: string;
  start: number;
}

function trimPiece(piece: Piece): Piece {
  let start = 0;
  while (start < piece.text.length && WHITESPACE.test(piece.text[start]!)) start++;
  let end = piece.text.length;
  while (end > start && WHITESPACE.test(piece.text[end - 1]!)) end--;
  return { text: piece.text.slice(start, end), start: piece.start + start };
}

const cache = new Map<string, ParseResult>();

function cacheKeyOf(value: string, eventName?: string, base = 0): string {
  return `${eventName ?? ""}\u0000${base}\u0000${value}`;
}

export function parse(value: string, eventName?: string): Phrase[] {
  const cacheKey = cacheKeyOf(value, eventName);
  const cached = cache.has(cacheKey);
  const { phrases, errors } = parseWithErrors(value, eventName);
  if (!cached) {
    for (const error of errors) {
      console.error(`[Interactable] invalid phrase "${error.phrase}": ${error.message}`);
    }
  }
  return phrases;
}

export function parseWithErrors(value: string, eventName?: string, base = 0): ParseResult {
  const cacheKey = cacheKeyOf(value, eventName, base);
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const phrases: Phrase[] = [];
  const errors: ParseError[] = [];
  for (const piece of splitTopLevel(value, ";")) {
    const trimmed = trimPiece({ text: piece.text, start: base + piece.start });
    if (trimmed.text === "") continue;
    try {
      phrases.push(parsePhrase(trimmed.text, trimmed.start));
    } catch (err) {
      if (err instanceof ParseError) {
        errors.push(new ParseError(err.message, err.start, err.end, trimmed.text));
      } else {
        errors.push(
          new ParseError(
            (err as Error).message,
            trimmed.start,
            trimmed.start + trimmed.text.length,
            trimmed.text,
          ),
        );
      }
    }
  }

  const result: ParseResult = { phrases, errors };
  cache.set(cacheKey, result);
  return result;
}

function parsePhrase(source: string, base: number): Phrase {
  const colon = findTopLevelColon(source);
  if (colon !== -1) {
    throw new ParseError(
      `phrase keys are not supported; filter with a handler parameter, e.g. "({ name: type }) => { … }"`,
      base + colon,
      base + colon + 1,
    );
  }

  const split = splitUnits(source);
  const operatorKinds = new Set(split.operators);
  if (operatorKinds.size > 1) {
    throw new ParseError(
      "cannot mix && and || in one phrase",
      base,
      base + source.length,
    );
  }

  const units = split.parts.map((part) => {
    const trimmed = trimPiece({ text: part.text, start: base + part.start });
    return parseUnit(trimmed.text, trimmed.start);
  });

  const phrase = located<PhraseBase>({ units }, base, base + source.length);
  if (split.operators.length > 0) {
    phrase.operator = split.operators[0] as "&&" | "||";
  }
  return phrase;
}

function parseUnit(source: string, base: number): Unit {
  const pieces = splitTopLevel(source, ".");
  const receiver = trimPiece({ text: pieces[0]!.text, start: base + pieces[0]!.start });
  if (receiver.text === "") {
    throw new ParseError("missing receiver", receiver.start, receiver.start);
  }
  const ref = parseRef(receiver.text, receiver.start);

  const calls: Call[] = [];
  const modifiers: Modifier[] = [];
  let timingSeen = false;
  for (let index = 1; index < pieces.length; index++) {
    const rawSegment = pieces[index]!;
    const segment = trimPiece({ text: rawSegment.text, start: base + rawSegment.start });
    if (segment.text === "") {
      throw new ParseError("empty link between dots", segment.start, segment.start);
    }
    const segmentEnd = segment.start + segment.text.length;
    const modifier = parseModifier(segment.text, segment.start);
    if (modifier !== undefined) {
      if ((modifier.kind === "debounce" || modifier.kind === "throttle") && calls.length > 0) {
        throw new ParseError(
          `modifier ${modifier.kind}() must come right after the receiver`,
          segment.start,
          segmentEnd,
        );
      }
      if (modifier.kind === "debounce" || modifier.kind === "throttle") {
        if (timingSeen) {
          throw new ParseError(
            "only one of debounce()/throttle() per receiver chain",
            segment.start,
            segmentEnd,
          );
        }
        timingSeen = true;
      }
      modifiers.push(
        located<ModifierBase>({ ...modifier, position: calls.length }, segment.start, segmentEnd),
      );
      continue;
    }
    calls.push(parseCall(segment.text, segment.start));
  }
  if (calls.length === 0) {
    throw new ParseError(
      "a phrase needs at least one verb call with parens",
      base,
      base + source.length,
    );
  }
  for (const modifier of modifiers) {
    if (modifier.kind === "once" && modifier.position === calls.length) {
      throw new ParseError(
        "once() must be followed by a verb call; it cannot end a chain",
        modifier.start,
        modifier.end,
      );
    }
  }
  return located<UnitBase>({ ref, calls, modifiers }, base, base + source.length);
}

function parseRef(segment: string, base: number): Ref {
  if (segment === "this") return located<RefBase>({ kind: "this" }, base, base + segment.length);
  if (segment.startsWith("#")) {
    const id = segment.slice(1);
    validateId(id, base + 1);
    return located<RefBase>({ kind: "id", id }, base, base + segment.length);
  }
  throw new ParseError(
    `"${segment}" is not a receiver; use #id or this`,
    base,
    base + segment.length,
  );
}

function validateId(id: string, base: number): void {
  if (id === "") throw new ParseError("empty id after #", base, base);
  if (!ID.test(id)) {
    throw new ParseError(
      `invalid id "${id}" in #${id}; ids used in phrases may not contain : & | { } ' " #`,
      base,
      base + id.length,
    );
  }
}

export function parseRefOrRead(text: string): RefOrRead | undefined {
  if (text === "this") {
    return { kind: "ref", ref: located<RefBase>({ kind: "this" }, 0, text.length) };
  }
  const read = READ.exec(text);
  if (read !== null) {
    const ref = parseRef(read[1]!, 0);
    const property = read[2]!;
    if ((READABLE_PROPERTIES as readonly string[]).includes(property)) {
      return { kind: "read", ref, property: property as ReadProperty };
    }
    return undefined;
  }
  if (text.startsWith("#") && !text.includes(".")) {
    const id = text.slice(1);
    validateId(id, 1);
    return { kind: "ref", ref: located<RefBase>({ kind: "id", id }, 0, text.length) };
  }
  return undefined;
}

const FIELD_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

const eventValueCache = new Map<string, EventValueResult>();

function eventValueCacheKey(value: string): string {
  return value;
}

export function parseEventValue(value: string): EventHandler[] {
  const cacheKey = eventValueCacheKey(value);
  const cached = eventValueCache.has(cacheKey);
  const { handlers, errors } = parseEventValueWithErrors(value);
  if (!cached) {
    for (const error of errors) {
      console.error(`[Interactable] invalid event value: ${error.message}`);
    }
  }
  return handlers;
}

export function parseEventValueWithErrors(value: string): EventValueResult {
  const cacheKey = eventValueCacheKey(value);
  const hit = eventValueCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const handlers: EventHandler[] = [];
  const errors: ParseError[] = [];
  const trimmed = trimPiece({ text: value, start: 0 });
  if (trimmed.text === "") {
    const result: EventValueResult = { handlers, errors };
    eventValueCache.set(cacheKey, result);
    return result;
  }

  let pieces: Piece[];
  try {
    if (trimmed.text.startsWith("[") || trimmed.text.endsWith("]")) {
      pieces = splitHandlerList(trimmed);
    } else {
      pieces = splitTopLevel(trimmed.text, ",").map((piece) => ({
        text: piece.text,
        start: trimmed.start + piece.start,
      }));
      if (pieces.filter((piece) => trimPiece(piece).text !== "").length > 1) {
        throw new ParseError(
          "two or more handlers need brackets: write \"[() => { … }, () => { … }]\"",
          trimmed.start,
          trimmed.start + trimmed.text.length,
        );
      }
    }
  } catch (err) {
    const error = err as ParseError;
    errors.push(new ParseError(error.message, error.start, error.end, trimmed.text));
    const result: EventValueResult = { handlers, errors };
    eventValueCache.set(cacheKey, result);
    return result;
  }

  for (const piece of pieces) {
    const handler = trimPiece({ text: piece.text, start: piece.start });
    if (handler.text === "") continue;
    try {
      handlers.push(parseHandler(handler.text, handler.start, errors));
    } catch (err) {
      if (err instanceof ParseError) {
        errors.push(new ParseError(err.message, err.start, err.end, handler.text));
      } else {
        errors.push(
          new ParseError(
            (err as Error).message,
            handler.start,
            handler.start + handler.text.length,
            handler.text,
          ),
        );
      }
    }
  }

  const result: EventValueResult = { handlers, errors };
  eventValueCache.set(cacheKey, result);
  return result;
}

function splitHandlerList(trimmed: Piece): Piece[] {
  if (!trimmed.text.startsWith("[") || !trimmed.text.endsWith("]")) {
    throw new ParseError(
      "unterminated handler list: a list must be wrapped in \"[ … ]\"",
      trimmed.start,
      trimmed.start + trimmed.text.length,
    );
  }
  const body = trimmed.text.slice(1, -1);
  const base = trimmed.start + 1;
  if (trimPiece({ text: body, start: base }).text === "") return [];
  const pieces = splitTopLevel(body, ",").map((piece) => ({
    text: piece.text,
    start: base + piece.start,
  }));
  for (const piece of pieces) {
    if (trimPiece(piece).text === "") {
      throw new ParseError("empty handler in list", piece.start, piece.start + piece.text.length);
    }
  }
  return pieces;
}

function parseHandler(source: string, base: number, errors: ParseError[]): EventHandler {
  const arrow = findHandlerArrow(source);
  if (arrow === -1) {
    throw new ParseError(
      `expected a handler "() => { … }" or "({ name: type }) => { … }", got "${source}"`,
      base,
      base + source.length,
    );
  }
  const parameterText = source.slice(0, arrow);
  const parameter = trimPiece({ text: parameterText, start: base });
  const bodyStart = base + arrow + 2;
  const body = trimPiece({ text: source.slice(arrow + 2), start: bodyStart });
  if (!body.text.startsWith("{") || !body.text.endsWith("}")) {
    throw new ParseError(
      `handler bodies must be braced: write "${parameter.text} => { ${body.text} }"`,
      body.start,
      body.start + body.text.length,
    );
  }
  const parsedParameter = parseHandlerParameter(parameter.text, parameter.start);
  const innerStart = body.start + 1;
  const inner = body.text.slice(1, -1);
  const parsedBody = parseWithErrors(inner, undefined, innerStart);
  errors.push(...parsedBody.errors);
  return located<{
    parameter: HandlerParameter;
    phrases: Phrase[];
  }>(
    { parameter: parsedParameter, phrases: parsedBody.phrases },
    base,
    base + source.length,
  ) as EventHandler;
}

function findHandlerArrow(source: string): number {
  let single = false;
  let paren = 0;
  for (let i = 0; i + 1 < source.length; i++) {
    const ch = source[i]!;
    if (ch === "'") {
      single = !single;
      continue;
    }
    if (single) {
      if (ch === "\\") i++;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "=" && source[i + 1] === ">" && paren === 0) return i;
  }
  return -1;
}

function parseHandlerParameter(source: string, base: number): HandlerParameter {
  if (source === "()") {
    return located<{ fields: LocatedHandlerField[] }>({ fields: [] }, base, base + source.length);
  }
  if (!source.startsWith("({") || !source.endsWith("})")) {
    throw new ParseError(
      `parameter must be "()" or "({ name: type })", got "${source}"`,
      base,
      base + source.length,
    );
  }
  const inner = source.slice(2, -2);
  const innerBase = base + 2;
  if (trimPiece({ text: inner, start: innerBase }).text === "") {
    throw new ParseError(
      `empty parameter object; use "()" for no fields`,
      base,
      base + source.length,
    );
  }
  const fields = splitTopLevel(inner, ",").map((rawField) => {
    const field = trimPiece({ text: rawField.text, start: innerBase + rawField.start });
    return parseHandlerField(field.text, field.start);
  });
  return located<{ fields: LocatedHandlerField[] }>({ fields }, base, base + source.length);
}

function parseHandlerField(source: string, base: number): LocatedHandlerField {
  const colon = source.indexOf(":");
  if (colon === -1) {
    throw new ParseError(
      `parameter field "${source}" needs "name: type"`,
      base,
      base + source.length,
    );
  }
  const namePiece = trimPiece({ text: source.slice(0, colon), start: base });
  const name = namePiece.text;
  if (!FIELD_NAME.test(name)) {
    throw new ParseError(
      `invalid parameter field name "${name}"`,
      namePiece.start,
      namePiece.start + name.length,
    );
  }
  const valuePiece = trimPiece({ text: source.slice(colon + 1), start: base + colon + 1 });
  const value = valuePiece.text;
  if (value === "") {
    throw new ParseError(
      `missing type for parameter field "${name}"`,
      valuePiece.start,
      valuePiece.start,
    );
  }
  if (value.includes("`")) {
    throw new ParseError(
      `backticked literals are not supported; write the literal with single quotes, e.g. ({ name: 'value' })`,
      valuePiece.start,
      valuePiece.start + value.length,
    );
  }
  const stringLiteral = STRING.exec(value);
  if (stringLiteral !== null) {
    return located<HandlerField>(
      { kind: "literal", name, value: unescapeString(stringLiteral[1]!) },
      base,
      base + source.length,
    );
  }
  if (NUMBER.test(value)) {
    return located<HandlerField>(
      { kind: "literal", name, value: Number(value) },
      base,
      base + source.length,
    );
  }
  if (value === "true" || value === "false") {
    return located<HandlerField>(
      { kind: "literal", name, value: value === "true" },
      base,
      base + source.length,
    );
  }
  return located<HandlerField>({ kind: "type", name, type: value }, base, base + source.length);
}

export function isNumberLiteral(text: string): boolean {
  return NUMBER.test(text);
}

export function isNumericUnion(type: string): boolean {
  const parts = type.split("|").map((part) => part.trim());
  return parts.length > 0 && parts.every(isNumberLiteral);
}

export function isBareNumber(type: string): boolean {
  return type.trim() === "number";
}

type ModifierSpec =
  | { kind: "debounce"; ms: number }
  | { kind: "throttle"; ms: number }
  | { kind: "once" }
  | { kind: "delay"; ms: number };

function parseModifier(segment: string, base: number): Located<ModifierSpec> | undefined {
  const compact = segment.replace(/\s+/g, "");
  const timing = TIMING.exec(compact);
  if (timing !== null) {
    const msText = timing[2]!.trim();
    if (!NUMBER.test(msText)) {
      throw new ParseError(
        `invalid ${timing[1]}() milliseconds "${msText}"`,
        base,
        base + segment.length,
      );
    }
    return located<ModifierSpec>(
      { kind: timing[1] as "debounce" | "throttle" | "delay", ms: Number(msText) },
      base,
      base + segment.length,
    );
  }
  if (compact === "once()") {
    return located<ModifierSpec>({ kind: "once" }, base, base + segment.length);
  }
  return undefined;
}

function parseCall(segment: string, base: number): Call {
  const match = CALL.exec(segment);
  if (match === null) {
    throw new ParseError(
      `expected a verb call with parens, got "${segment}"`,
      base,
      base + segment.length,
    );
  }
  const verb = match[1]!;
  const inner = match[2]!;
  const trimmed = inner.trim();
  let arg: Arg | undefined;
  if (trimmed !== "") {
    const innerBase = base + segment.indexOf("(") + 1;
    if (trimmed.startsWith("{")) {
      const objectStart = innerBase + (inner.length - inner.trimStart().length);
      arg = parseObject(trimmed, objectStart);
    } else {
      const positionalPieces = splitTopLevel(inner, ",");
      const positional = positionalPieces.map((piece) => piece.text.trim());
      if (positional.length > 1) {
        throw new ParseError(
          `verb ${verb}() takes one argument, got ${positional.length}`,
          base,
          base + segment.length,
        );
      }
      const piece = trimPiece(positionalPieces[0]!);
      arg = parseArg(piece.text, innerBase + piece.start, piece.start);
    }
  }
  const call = located<CallBase>({ verb }, base, base + segment.length);
  if (arg !== undefined) call.arg = arg;
  return call;
}

function parseArg(text: string, base: number, position: number): Arg {
  if (NUMBER.test(text)) {
    return located<ArgBase>({ kind: "number", value: Number(text) }, base, base + text.length);
  }
  if (text === "true" || text === "false") {
    return located<ArgBase>({ kind: "boolean", value: text === "true" }, base, base + text.length);
  }
  const stringMatch = STRING.exec(text);
  if (stringMatch !== null) {
    return located<ArgBase>(
      { kind: "string", value: unescapeString(stringMatch[1]!) },
      base,
      base + text.length,
    );
  }
  if (text === "this") {
    return located<ArgBase>(
      { kind: "ref", ref: located<RefBase>({ kind: "this" }, base, base + text.length) },
      base,
      base + text.length,
    );
  }

  const read = READ.exec(text);
  if (read !== null) {
    const ref = parseRef(read[1]!, base);
    const property = read[2]!;
    if ((READABLE_PROPERTIES as readonly string[]).includes(property)) {
      return located<ArgBase>(
        { kind: "read", ref, property: property as ReadProperty },
        base,
        base + text.length,
      );
    }
    const propertyBase = base + text.lastIndexOf(".") + 1;
    if (property === "valueAsNumber") {
      throw new ParseError(
        ".valueAsNumber is not a property; .value on a number input is already a number",
        propertyBase,
        propertyBase + property.length,
      );
    }
    if (property !== "height" && property !== "width") {
      throw new ParseError(
        `property "${property}" is not readable; only value, checked, min, max, step`,
        propertyBase,
        propertyBase + property.length,
      );
    }
  }

  if (text.startsWith("#") && !text.includes(".")) {
    const id = text.slice(1);
    validateId(id, base + 1);
    return located<ArgBase>(
      { kind: "ref", ref: located<RefBase>({ kind: "id", id }, base, base + text.length) },
      base,
      base + text.length,
    );
  }
  if (IDENT.test(text)) {
    return located<ArgBase>({ kind: "name", name: text }, base, base + text.length);
  }
  if (text.includes("-") && HYPHENATED_NAME.test(text)) {
    return located<ArgBase>({ kind: "name", name: text }, base, base + text.length);
  }
  return expressionArg(text, base, position);
}

function expressionArg(text: string, base: number, position: number): Arg {
  try {
    parseFormula(text);
  } catch (err) {
    throw new ParseError(
      `expression at position ${position}: ${(err as Error).message}`,
      base,
      base + text.length,
    );
  }
  return located<ArgBase>({ kind: "expr", source: text, position }, base, base + text.length);
}

function unescapeString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) {
        out += ch;
        break;
      }
      if (next === "'" || next === "\\") {
        out += next;
        i++;
        continue;
      }
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function parseObject(source: string, base: number): Arg {
  if (!source.endsWith("}")) {
    throw new ParseError("unterminated object literal", base, base + source.length);
  }
  const body = source.slice(1, -1);
  const bodyBase = base + 1;
  const trimmedBody = trimPiece({ text: body, start: bodyBase });
  if (trimmedBody.text === "") {
    throw new ParseError("object literal needs at least one field", base, base + source.length);
  }
  const fieldPieces = splitTopLevel(body, ",");
  const parsed = fieldPieces.map((rawField) => {
    const field = trimPiece({ text: rawField.text, start: bodyBase + rawField.start });
    const colon = field.text.indexOf(":");
    if (colon === -1) {
      throw new ParseError(
        `object field "${field.text}" needs "name: value"`,
        field.start,
        field.start + field.text.length,
      );
    }
    const namePiece = trimPiece({ text: field.text.slice(0, colon), start: field.start });
    const name = namePiece.text;
    if (!IDENT.test(name)) {
      throw new ParseError(
        `invalid object field name "${name}"`,
        namePiece.start,
        namePiece.start + name.length,
      );
    }
    const valuePiece = trimPiece({
      text: field.text.slice(colon + 1),
      start: field.start + colon + 1,
    });
    const valuePosition = valuePiece.start - bodyBase;
    return { name, value: parseArg(valuePiece.text, valuePiece.start, valuePosition) };
  });
  return located<ArgBase>({ kind: "object", fields: parsed }, base, base + source.length);
}

function findTopLevelColon(raw: string): number {
  let single = false;
  let paren = 0;
  let brace = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "'") {
      single = !single;
      continue;
    }
    if (single) {
      if (ch === "\\" && i + 1 < raw.length) i++;
      continue;
    }
    if (ch === "(") {
      paren++;
      continue;
    }
    if (ch === ")") {
      paren--;
      continue;
    }
    if (ch === "{") {
      brace++;
      continue;
    }
    if (ch === "}") {
      brace--;
      continue;
    }
    if (ch === ":" && paren === 0 && brace === 0) return i;
  }
  return -1;
}

function splitUnits(text: string): { parts: Piece[]; operators: string[] } {
  const parts: Piece[] = [];
  const operators: string[] = [];
  let current = "";
  let currentStart = 0;
  let single = false;
  let paren = 0;
  let brace = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'") {
      single = !single;
      current += ch;
      continue;
    }
    if (single) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[i + 1]!;
        i++;
      }
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    if (paren === 0 && brace === 0 && (ch === "&" || ch === "|")) {
      const next = text[i + 1];
      if (next === ch) {
        parts.push({ text: current, start: currentStart });
        operators.push(ch === "&" ? "&&" : "||");
        current = "";
        i++;
        currentStart = i + 1;
        continue;
      }
    }
    current += ch;
  }
  parts.push({ text: current, start: currentStart });
  return { parts, operators };
}

function splitTopLevel(text: string, separator: string): Piece[] {
  const parts: Piece[] = [];
  let current = "";
  let currentStart = 0;
  let single = false;
  let paren = 0;
  let brace = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'") {
      single = !single;
      current += ch;
      continue;
    }
    if (single) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[i + 1]!;
        i++;
      }
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    if (ch === separator && paren === 0 && brace === 0) {
      parts.push({ text: current, start: currentStart });
      current = "";
      currentStart = i + 1;
    } else {
      current += ch;
    }
  }
  parts.push({ text: current, start: currentStart });
  return parts;
}
