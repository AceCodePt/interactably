import { isAttached } from "@interactable/attachment.ts";
import { parse, isNumericUnion } from "@interactable/parser.ts";
import { getEventFieldTypes } from "@interactable/events.ts";
import { matchesKey } from "@interactable/keys.ts";
import { INTERSECT_EVENT_NAMES } from "@interactable/intersect.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";
import type { Arg, EventAttribute, Modifier, Phrase, Ref, Unit } from "@interactable/parser.ts";
import { readValue } from "@behaviors/implementation-utils.ts";
import { evaluateFormula, FormulaError } from "@utils/formula.ts";
import { logOnce, clearLogs } from "@interactable/log.ts";
import { describeElement } from "@interactable/describe-element.ts";

const KEYBOARD_EVENT_TYPES = new Set(["keydown", "keyup"]);

interface ElementPhraseState {
  spentOnce: Set<string>;
  debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
  pending: Set<ReturnType<typeof setTimeout>>;
  throttles: Map<string, number>;
}

const stateByElement = new WeakMap<Element, ElementPhraseState>();

function stateOf(el: Element): ElementPhraseState {
  let state = stateByElement.get(el);
  if (state === undefined) {
    state = {
      spentOnce: new Set(),
      debounceTimers: new Map(),
      pending: new Set(),
      throttles: new Map(),
    };
    stateByElement.set(el, state);
  }
  return state;
}

export function clearPhraseState(el: Element): void {
  const state = stateByElement.get(el);
  if (state === undefined) return;
  for (const timer of state.debounceTimers.values()) clearTimeout(timer);
  for (const timer of state.pending) clearTimeout(timer);
  clearLogs(el);
  stateByElement.delete(el);
}

export function runPhrases(source: Element, value: string, ev: Event, eventAttribute?: EventAttribute): void {
  let phrases: Phrase[];
  try {
    phrases = parse(value, ev.type);
  } catch (err) {
    console.error("[Interactable]", err);
    return;
  }
  for (let index = 0; index < phrases.length; index++) {
    try {
      runPhrase(source, value, index, phrases[index]!, ev, eventAttribute);
    } catch (err) {
      console.error("[Interactable] phrase skipped:", err);
    }
  }
}

function runPhrase(
  source: Element,
  value: string,
  index: number,
  phrase: Phrase,
  ev: Event,
  eventAttribute?: EventAttribute,
): void {
  if (eventAttribute !== undefined && !matchesLiteralDeclarations(source, eventAttribute, ev)) return;
  if (KEYBOARD_EVENT_TYPES.has(ev.type)) {
    if (phrase.key !== undefined) {
      const keyboardEvent = ev as KeyboardEvent;
      if (typeof keyboardEvent.key !== "string" || !matchesKey(keyboardEvent, phrase.key)) return;
    }
  } else if (ev instanceof ImplementationEvent && ev.key !== undefined) {
    if (!INTERSECT_EVENT_NAMES.has(ev.type) && phrase.key !== ev.key) {
      return;
    }
  } else if (phrase.key !== undefined) {
    logOnce(source, `key "${phrase.key}" on non-keyboard event "${ev.type}"; phrase skipped`);
    return;
  }

  const key = `${value}\u0000${index}`;

  const walkState: WalkState = {
    source,
    phrase,
    units: phrase.units,
    ev,
    key,
    unitIndex: 0,
    callIndex: 0,
    modIndex: 0,
    spentOnces: [],
  };
  try {
    walk(walkState);
  } catch (err) {
    console.error("[Interactable]", err);
  }
}

function matchesLiteralDeclarations(source: Element, eventAttribute: EventAttribute, ev: Event): boolean {
  const declaration = eventAttribute.declaration;
  if (declaration === undefined) return true;
  const fields = getEventFieldTypes(source, ev.type);
  for (const value of declaration) {
    if (value.kind !== "literal") continue;
    const raw = fieldValue(ev, value.name);
    if (raw === undefined) return false;
    const fieldType = fields?.[value.name];
    if (fieldType !== undefined && isNumericUnion(fieldType)) {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric !== Number(value.literal)) return false;
    } else if (raw.toLowerCase() !== value.literal.toLowerCase()) {
      return false;
    }
  }
  return true;
}

function fieldValue(ev: Event, name: string): string | undefined {
  if (KEYBOARD_EVENT_TYPES.has(ev.type) && (name === "key" || name === "code")) {
    const value = (ev as KeyboardEvent)[name];
    return typeof value === "string" ? value : undefined;
  }
  if (ev instanceof ImplementationEvent) return ev.values[name];
  return undefined;
}

type Outcome = "completed" | "guard" | "failed" | "paused";

interface ChainResult {
  outcome: Outcome;
  aborted?: boolean;
}

interface WalkState {
  source: Element;
  phrase: Phrase;
  units: Unit[];
  ev: Event;
  key: string;
  unitIndex: number;
  callIndex: number;
  modIndex: number;
  spentOnces: string[];
}

function walk(state: WalkState): ChainResult {
  const operator = state.phrase.operator;
  while (state.unitIndex < state.units.length) {
    const unit = state.units[state.unitIndex]!;
    const result = walkUnit(state, unit);
    if (result.outcome === "paused") return result;
    if (operator === undefined) return result;
    if (operator === "&&") {
      if (result.outcome === "guard") return result;
      if (result.outcome !== "completed") return result;
      state.unitIndex += 1;
      state.callIndex = 0;
      state.modIndex = 0;
      continue;
    }
    if (result.outcome === "completed") return { outcome: "completed" };
    if (result.outcome === "guard") {
      const fallbackAborted = state.unitIndex === state.units.length - 1;
      state.unitIndex += 1;
      state.callIndex = 0;
      state.modIndex = 0;
      if (fallbackAborted) {
        for (const spent of state.spentOnces) stateOf(state.source).spentOnce.delete(spent);
        return { outcome: "guard", aborted: true };
      }
      continue;
    }
    return { outcome: "failed" };
  }
  return operator === "||" ? { outcome: "guard" } : { outcome: "completed" };
}

function walkUnit(state: WalkState, unit: Unit): ChainResult {
  const source = state.source;
  while (
    state.modIndex < unit.modifiers.length &&
    unit.modifiers[state.modIndex]!.position === 0 &&
    (unit.modifiers[state.modIndex]!.kind === "debounce" || unit.modifiers[state.modIndex]!.kind === "throttle")
  ) {
    const modifier = unit.modifiers[state.modIndex]!;
    state.modIndex += 1;
    const outcome = applyModifier(state, modifier);
    if (outcome !== undefined) return { outcome };
  }

  const receiver = resolveRef(unit.ref, source);
  if (receiver === null) {
    logOnce(source, `receiver ${describeRef(unit.ref)} not found; phrase skipped`);
    return { outcome: "failed" };
  }
  if (!isAttached(receiver)) {
    logOnce(
      source,
      `${describeRef(unit.ref)} is not attached: it has no implements or on-* attribute, or start() has not run`,
    );
    return { outcome: "failed" };
  }

  while (true) {
    while (state.modIndex < unit.modifiers.length && unit.modifiers[state.modIndex]!.position <= state.callIndex) {
      const modifier = unit.modifiers[state.modIndex]!;
      state.modIndex += 1;
      const outcome = applyModifier(state, modifier);
      if (outcome !== undefined) return { outcome };
    }
    if (state.callIndex >= unit.calls.length) break;
    const call = unit.calls[state.callIndex]!;
    state.callIndex += 1;
    let arg: unknown;
    try {
      arg = resolveArg(call.arg, source, { ev: state.ev, verb: call.verb });
    } catch (err) {
      if (err instanceof FormulaError && err.label !== undefined) {
        logOnce(source, `${err.label}${err.message}`);
      } else {
        logOnce(source, `argument for ${call.verb}(): ${(err as Error).message}; phrase skipped`);
      }
      return { outcome: "failed" };
    }

    const event = new InteractionEvent({ verb: call.verb, arg, source, originalEvent: state.ev });
    receiver.dispatchEvent(event);

    if (!event.handled) {
      logOnce(source, `no implementation on ${describeElement(receiver)} handles ${call.verb}()`);
      return { outcome: "failed" };
    }
    if (event.error !== undefined) {
      logOnce(source, `${call.verb}() on ${describeElement(receiver)} threw: ${describeError(event.error)}`);
      return { outcome: "failed" };
    }
    if (event.pauseMs !== undefined) {
      scheduleResume(state, event.pauseMs);
      return { outcome: "paused" };
    }
    if (event.defaultPrevented) return { outcome: "guard" };
  }
  return { outcome: "completed" };
}

function applyModifier(state: WalkState, modifier: Modifier): Outcome | undefined {
  const chainKey = chainKeyOf(state.key, state.unitIndex);
  const elState = stateOf(state.source);
  switch (modifier.kind) {
    case "once": {
      if (elState.spentOnce.has(chainKey)) return "guard";
      elState.spentOnce.add(chainKey);
      state.spentOnces.push(chainKey);
      return undefined;
    }
    case "delay":
      scheduleResume(state, modifier.ms);
      return "paused";
    case "debounce":
      scheduleDebounce(state, chainKey, modifier.ms);
      return "paused";
    case "throttle": {
      const last = elState.throttles.get(chainKey) ?? 0;
      const now = Date.now();
      if (now - last < modifier.ms) return "guard";
      elState.throttles.set(chainKey, now);
      return undefined;
    }
  }
}

function chainKeyOf(key: string, unitIndex: number): string {
  return `${key}\u0000${unitIndex}`;
}

function scheduleResume(state: WalkState, ms: number): void {
  const pending = stateOf(state.source).pending;
  const timer = setTimeout(() => {
    pending.delete(timer);
    try {
      walk(state);
    } catch (err) {
      console.error("[Interactable]", err);
    }
  }, ms);
  pending.add(timer); // spentOnces is an array on the per-walk WalkState, so two remainders in flight do not share cursor or gate state
}

function scheduleDebounce(state: WalkState, chainKey: string, ms: number): void {
  const debounceTimers = stateOf(state.source).debounceTimers;
  const existing = debounceTimers.get(chainKey);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(chainKey);
    try {
      walk(state);
    } catch (err) {
      console.error("[Interactable]", err);
    }
  }, ms);
  debounceTimers.set(chainKey, timer);
}

function resolveRef(ref: Ref, source: Element): Element | null {
  if (ref.kind === "this") return source;
  if (typeof document === "undefined") {
    throw new Error(`cannot resolve #${ref.id}: no document`);
  }
  return document.getElementById(ref.id);
}

function resolveArg(
  arg: Arg | undefined,
  source: Element,
  context: { ev: Event; verb: string; fieldName?: string },
): unknown {
  if (arg === undefined) return undefined;
  switch (arg.kind) {
    case "number":
    case "string":
    case "boolean":
      return arg.value;
    case "ref": {
      const el = resolveRef(arg.ref, source);
      if (el === null) throw new Error(`${describeRef(arg.ref)} not found`);
      return el;
    }
    case "read": {
      const el = resolveRef(arg.ref, source);
      if (el === null) throw new Error(`${describeRef(arg.ref)} not found`);
      return readValue(el, arg.property);
    }
    case "name": {
      if (KEYBOARD_EVENT_TYPES.has(context.ev.type)) {
        if (arg.name === "key") return (context.ev as KeyboardEvent).key;
        if (arg.name === "code") return (context.ev as KeyboardEvent).code;
      }
      if (context.ev instanceof ImplementationEvent) {
        const value = context.ev.values[arg.name];
        if (value !== undefined) return value;
      }
      throw new Error(
        `"${arg.name}" is not a value of event "${context.ev.type}"; ` +
          `declare it on the attribute, e.g. on-${context.ev.type}(${arg.name}: string)`,
      );
    }
    case "expr": {
      try {
        return evaluateFormula(arg.source, { document: source.ownerDocument, source }).value;
      } catch (err) {
        if (err instanceof FormulaError) {
          const field = context.fieldName !== undefined ? `, field ${context.fieldName}` : "";
          err.label = `on-${context.ev.type} on ${describeElement(source)}, argument 1 of ${context.verb}()${field}: `;
        }
        throw err;
      }
    }
    case "object": {
      const out: Record<string, unknown> = {};
      for (const field of arg.fields) {
        out[field.name] = resolveArg(field.value, source, { ...context, fieldName: field.name });
      }
      return out;
    }
  }
}

function describeRef(ref: Ref): string {
  return ref.kind === "this" ? "this" : `#${ref.id}`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}