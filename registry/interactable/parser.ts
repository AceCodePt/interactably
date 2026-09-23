import { parseFormula } from "@utils/formula.ts";

export type Ref = { kind: "id"; id: string } | { kind: "this" };

export const READABLE_PROPERTIES = ["value", "checked", "min", "max", "step"] as const;

export type ReadProperty = (typeof READABLE_PROPERTIES)[number];

export type Arg =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "ref"; ref: Ref }
  | { kind: "read"; ref: Ref; property: ReadProperty }
  | { kind: "name"; name: string }
  | { kind: "expr"; source: string; position: number }
  | { kind: "object"; fields: ReadonlyArray<{ name: string; value: Arg }> };

export type RefOrRead =
  | { kind: "ref"; ref: Ref }
  | { kind: "read"; ref: Ref; property: ReadProperty };

export interface Call {
  verb: string;
  arg?: Arg;
}

export type Modifier =
  | { kind: "debounce"; ms: number; position: number }
  | { kind: "throttle"; ms: number; position: number }
  | { kind: "once"; position: number }
  | { kind: "delay"; ms: number; position: number };

export interface Unit {
  ref: Ref;
  calls: Call[];
  modifiers: Modifier[];
}

export interface Phrase {
  key?: string;
  units: Unit[];
  operator?: "&&" | "||";
}

const CALL = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([\s\S]*)\)$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const STRING = /^'([^']*)'$/;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DECL_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;
const ID = /^[^\s,;.()&|{}:'"#]+$/;
const KEY = /^[^\s.,;()&|{}:'"#]+$/;
const TIMING = /^(debounce|throttle|delay)\(([^)]*)\)$/;
const READ = /^(this|#[^\s,;.()]+)\.([A-Za-z_$][A-Za-z0-9_$]*)$/;

const cache = new Map<string, Phrase[]>();

export function parse(value: string, eventName?: string): Phrase[] {
  const cacheKey = `${eventName ?? ""}\u0000${value}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const phrases: Phrase[] = [];
  const errors: string[] = [];
  for (const raw of splitTopLevel(value, ";")) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    try {
      phrases.push(parsePhrase(trimmed));
    } catch (err) {
      errors.push(`"${trimmed}": ${(err as Error).message}`);
    }
  }

  cache.set(cacheKey, phrases);
  for (const error of errors) console.error(`[Interactable] invalid phrase ${error}`);
  return phrases;
}

function parsePhrase(raw: string): Phrase {
  const colon = findKeyColon(raw);
  let key: string | undefined;
  let body = raw;
  if (colon !== -1) {
    const keyText = raw.slice(0, colon).trim();
    if (keyText === "") throw new Error(`empty key before ":"`);
    if (!KEY.test(keyText)) {
      throw new Error(`invalid key "${keyText}"`);
    }
    if (keyText.includes("+") && keyText.length > 1) {
      throw new Error(`invalid key "${keyText}": modifier keys are not supported`);
    }
    key = keyText;
    body = raw.slice(colon + 1);
  }

  const split = splitUnits(body);
  const operatorKinds = new Set(split.operators);
  if (operatorKinds.size > 1) {
    throw new Error("cannot mix && and || in one phrase");
  }

  const units = split.parts.map((part) => parseUnit(part));

  const phrase: Phrase = { units };
  if (key !== undefined) phrase.key = key;
  if (split.operators.length > 0) {
    phrase.operator = split.operators[0] as "&&" | "||";
  }
  return phrase;
}

function parseUnit(raw: string): Unit {
  const segments = splitTopLevel(raw, ".").map((s) => s.trim());
  if (segments.length === 0 || segments[0] === "") throw new Error("missing receiver");
  const ref = parseRef(segments[0]!);

  const calls: Call[] = [];
  const modifiers: Modifier[] = [];
  let timingSeen = false;
  for (const segment of segments.slice(1)) {
    if (segment === "") throw new Error("empty link between dots");
    const modifier = parseModifier(segment);
    if (modifier !== undefined) {
      if ((modifier.kind === "debounce" || modifier.kind === "throttle") && calls.length > 0) {
        throw new Error(`modifier ${modifier.kind}() must come right after the receiver`);
      }
      if (modifier.kind === "debounce" || modifier.kind === "throttle") {
        if (timingSeen) throw new Error("only one of debounce()/throttle() per receiver chain");
        timingSeen = true;
      }
      modifiers.push({ ...modifier, position: calls.length });
      continue;
    }
    calls.push(parseCall(segment));
  }
  if (calls.length === 0) throw new Error("a phrase needs at least one verb call with parens");
  for (const modifier of modifiers) {
    if (modifier.kind === "once" && modifier.position === calls.length) {
      throw new Error("once() must be followed by a verb call; it cannot end a chain");
    }
  }
  return { ref, calls, modifiers };
}

function parseRef(segment: string): Ref {
  if (segment === "this") return { kind: "this" };
  if (segment.startsWith("#")) {
    const id = segment.slice(1);
    validateId(id);
    return { kind: "id", id };
  }
  throw new Error(`"${segment}" is not a receiver; use #id or this`);
}

function validateId(id: string): void {
  if (id === "") throw new Error("empty id after #");
  if (!ID.test(id)) {
    throw new Error(
      `invalid id "${id}" in #${id}; ids used in phrases may not contain : & | { } ' " #`,
    );
  }
}

export function parseRefOrRead(text: string): RefOrRead | undefined {
  if (text === "this") return { kind: "ref", ref: { kind: "this" } };
  const read = READ.exec(text);
  if (read !== null) {
    const ref = parseRef(read[1]!);
    const property = read[2]!;
    if ((READABLE_PROPERTIES as readonly string[]).includes(property)) {
      return { kind: "read", ref, property: property as ReadProperty };
    }
    return undefined;
  }
  if (text.startsWith("#") && !text.includes(".")) {
    const id = text.slice(1);
    validateId(id);
    return { kind: "ref", ref: { kind: "id", id } };
  }
  return undefined;
}

export type EventValueDeclaration =
  | { kind: "type"; name: string; type: string }
  | { kind: "literal"; name: string; literal: string };

export interface EventAttribute {
  type: string;
  declaration: readonly EventValueDeclaration[] | undefined;
}

export function parseEventAttribute(name: string): EventAttribute {
  const open = name.indexOf("(");
  if (open === -1) return { type: name, declaration: undefined };
  const type = name.slice(0, open);
  if (type === "") throw new Error(`empty event type before "(" in "${name}"`);
  if (!name.endsWith(")")) throw new Error(`unterminated value declaration in "${name}": missing ")"`);
  const parts = name
    .slice(open + 1, -1)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) throw new Error(`empty value declaration in "${name}"; expected "name:type"`);
  const declaration = parts.map((part, index): EventValueDeclaration => {
    const colon = part.indexOf(":");
    if (colon === -1) throw new Error(`value ${index + 1} in "${name}": expected "name:type", got "${part}"`);
    const declName = part.slice(0, colon).trim();
    const rhs = part.slice(colon + 1).trim();
    if (!DECL_NAME.test(declName)) {
      throw new Error(`value ${index + 1} in "${name}": "${declName}" is not a valid value name`);
    }
    if (rhs === "") throw new Error(`value ${index + 1} in "${name}": missing type for "${declName}"`);
    if (rhs.startsWith("`")) {
      if (!rhs.endsWith("`")) {
        throw new Error(`value ${index + 1} in "${name}": unterminated backtick in literal for "${declName}"`);
      }
      const literal = rhs.slice(1, -1);
      if (literal === "") throw new Error(`value ${index + 1} in "${name}": empty literal for "${declName}"`);
      if (literal.includes("`")) {
        throw new Error(`value ${index + 1} in "${name}": literal for "${declName}" contains a backtick`);
      }
      return { kind: "literal", name: declName, literal };
    }
    return { kind: "type", name: declName, type: rhs };
  });
  const literalCount = declaration.reduce((count, value) => (value.kind === "literal" ? count + 1 : count), 0);
  if (literalCount > 0 && literalCount < declaration.length) {
    throw new Error(`value declaration in "${name}": a declaration either matches literals or binds types, not both`);
  }
  return { type, declaration };
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

function parseModifier(segment: string): ModifierSpec | undefined {
  const compact = segment.replace(/\s+/g, "");
  const timing = TIMING.exec(compact);
  if (timing !== null) {
    const msText = timing[2]!.trim();
    if (!NUMBER.test(msText)) throw new Error(`invalid ${timing[1]}() milliseconds "${msText}"`);
    return { kind: timing[1] as "debounce" | "throttle" | "delay", ms: Number(msText) };
  }
  if (compact === "once()") return { kind: "once" };
  return undefined;
}

function parseCall(segment: string): Call {
  const match = CALL.exec(segment);
  if (match === null) throw new Error(`expected a verb call with parens, got "${segment}"`);
  const verb = match[1]!;
  const inner = match[2]!;
  const trimmed = inner.trim();
  let arg: Arg | undefined;
  if (trimmed !== "") {
    if (trimmed.startsWith("{")) {
      arg = parseObject(trimmed);
    } else {
      const positional = splitTopLevel(inner, ",").map((s) => s.trim());
      if (positional.length > 1) {
        throw new Error(`verb ${verb}() takes one argument, got ${positional.length}`);
      }
      arg = parseArg(positional[0]!, inner.indexOf(positional[0]!));
    }
  }
  const call: Call = { verb };
  if (arg !== undefined) call.arg = arg;
  return call;
}

function parseArg(text: string, position: number): Arg {
  if (NUMBER.test(text)) return { kind: "number", value: Number(text) };
  if (text === "true" || text === "false") return { kind: "boolean", value: text === "true" };
  const stringMatch = STRING.exec(text);
  if (stringMatch !== null) return { kind: "string", value: unescapeString(stringMatch[1]!) };
  if (text === "this") return { kind: "ref", ref: { kind: "this" } };

  const read = READ.exec(text);
  if (read !== null) {
    const ref = parseRef(read[1]!);
    const property = read[2]!;
    if ((READABLE_PROPERTIES as readonly string[]).includes(property)) {
      return { kind: "read", ref, property: property as ReadProperty };
    }
    if (property === "valueAsNumber") {
      throw new Error(".valueAsNumber is not a property; .value on a number input is already a number");
    }
    if (property !== "height" && property !== "width") {
      throw new Error(
        `property "${property}" is not readable; only value, checked, min, max, step`,
      );
    }
  }

  if (text.startsWith("#") && !text.includes(".")) {
    const id = text.slice(1);
    validateId(id);
    return { kind: "ref", ref: { kind: "id", id } };
  }
  if (IDENT.test(text)) return { kind: "name", name: text };
  return expressionArg(text, position);
}

function expressionArg(text: string, position: number): Arg {
  try {
    parseFormula(text);
  } catch (err) {
    throw new Error(`expression at position ${position}: ${(err as Error).message}`);
  }
  return { kind: "expr", source: text, position };
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

function parseObject(inner: string): Arg {
  if (!inner.endsWith("}")) throw new Error("unterminated object literal");
  const body = inner.slice(1, -1).trim();
  if (body === "") throw new Error("object literal needs at least one field");
  const fields = splitTopLevel(body, ",").map((s) => s.trim());
  const parsed = fields.map((field) => {
    const fieldIndex = body.indexOf(field);
    const colon = field.indexOf(":");
    if (colon === -1) throw new Error(`object field "${field}" needs "name: value"`);
    const name = field.slice(0, colon).trim();
    if (!IDENT.test(name)) throw new Error(`invalid object field name "${name}"`);
    const afterColon = field.slice(colon + 1);
    const valueText = afterColon.trim();
    const valuePosition = fieldIndex + colon + 1 + (afterColon.length - afterColon.trimStart().length);
    return { name, value: parseArg(valueText, valuePosition) };
  });
  return { kind: "object", fields: parsed };
}

function findKeyColon(raw: string): number {
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

function splitUnits(text: string): { parts: string[]; operators: string[] } {
  const parts: string[] = [];
  const operators: string[] = [];
  let current = "";
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
        parts.push(current);
        operators.push(ch === "&" ? "&&" : "||");
        current = "";
        i++;
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  return { parts, operators };
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
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
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}