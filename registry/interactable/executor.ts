import { parse } from "@interactable/parser.ts";
import { matchesKey } from "@interactable/keys.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";
import type { Arg, Modifier, Phrase, Ref, Unit } from "@interactable/parser.ts";

const KEYBOARD_EVENT_TYPES = new Set(["keydown", "keyup"]);

interface ElementPhraseState {
  spentOnce: Set<string>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  throttles: Map<string, number>;
  logged: Set<string>;
}

const stateByElement = new WeakMap<Element, ElementPhraseState>();

function stateOf(el: Element): ElementPhraseState {
  let state = stateByElement.get(el);
  if (state === undefined) {
    state = { spentOnce: new Set(), timers: new Map(), throttles: new Map(), logged: new Set() };
    stateByElement.set(el, state);
  }
  return state;
}

export function clearPhraseState(el: Element): void {
  const state = stateByElement.get(el);
  if (state === undefined) return;
  for (const timer of state.timers.values()) clearTimeout(timer);
  stateByElement.delete(el);
}

export function runPhrases(source: Element, value: string, ev: Event): void {
  let phrases: Phrase[];
  try {
    phrases = parse(value);
  } catch (err) {
    console.error("[Interactable]", err);
    return;
  }
  for (let index = 0; index < phrases.length; index++) {
    try {
      runPhrase(source, value, index, phrases[index]!, ev);
    } catch (err) {
      console.error("[Interactable] phrase skipped:", err);
    }
  }
}

function runPhrase(source: Element, value: string, index: number, phrase: Phrase, ev: Event): void {
  if (phrase.key !== undefined) {
    if (!KEYBOARD_EVENT_TYPES.has(ev.type)) {
      logOnce(source, `key "${phrase.key}" on non-keyboard event "${ev.type}"; phrase skipped`);
      return;
    }
    const keyboardEvent = ev as KeyboardEvent;
    if (typeof keyboardEvent.key !== "string" || !matchesKey(keyboardEvent, phrase.key)) return;
  }

  const key = `${value}\u0000${index}`;
  const state = stateOf(source);
  clearPending(state, key, phrase.units.length);

  const walkState: WalkState = {
    source,
    phrase,
    units: phrase.units,
    ev,
    key,
    unitIndex: 0,
    callIndex: 0,
    modIndex: 0,
  };
  try {
    walk(walkState);
  } catch (err) {
    console.error("[Interactable]", err);
  }
}

type Outcome = "completed" | "guard" | "failed" | "paused";

interface ChainResult {
  outcome: Outcome;
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
      state.unitIndex += 1;
      state.callIndex = 0;
      state.modIndex = 0;
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
      arg = resolveArg(call.arg, source);
    } catch (err) {
      logOnce(source, `argument for ${call.verb}(): ${(err as Error).message}; phrase skipped`);
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

function clearPending(state: ElementPhraseState, key: string, unitCount: number): void {
  const pauseKey = pauseTimerKey(key);
  const pending = state.timers.get(pauseKey);
  if (pending !== undefined) {
    clearTimeout(pending);
    state.timers.delete(pauseKey);
  }
  for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
    const chainKey = chainKeyOf(key, unitIndex);
    const timer = state.timers.get(chainKey);
    if (timer !== undefined) {
      clearTimeout(timer);
      state.timers.delete(chainKey);
    }
  }
}

function scheduleResume(state: WalkState, ms: number): void {
  const timers = stateOf(state.source).timers;
  const pauseKey = pauseTimerKey(state.key);
  const existing = timers.get(pauseKey);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(pauseKey);
    try {
      walk(state);
    } catch (err) {
      console.error("[Interactable]", err);
    }
  }, ms);
  timers.set(pauseKey, timer);
}

function scheduleDebounce(state: WalkState, chainKey: string, ms: number): void {
  const timers = stateOf(state.source).timers;
  const existing = timers.get(chainKey);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(chainKey);
    try {
      walk(state);
    } catch (err) {
      console.error("[Interactable]", err);
    }
  }, ms);
  timers.set(chainKey, timer);
}

function pauseTimerKey(key: string): string {
  return `${key}\u0000pause`;
}

function resolveRef(ref: Ref, source: Element): Element | null {
  if (ref.kind === "this") return source;
  if (typeof document === "undefined") {
    throw new Error(`cannot resolve #${ref.id}: no document`);
  }
  return document.getElementById(ref.id);
}

function resolveArg(arg: Arg | undefined, source: Element): unknown {
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
      const target = el as unknown as Record<string, unknown>;
      if (!(arg.property in target)) {
        throw new Error(`${describeRef(arg.ref)} has no ${arg.property} property`);
      }
      return target[arg.property];
    }
    case "object": {
      const out: Record<string, unknown> = {};
      for (const field of arg.fields) out[field.name] = resolveArg(field.value, source);
      return out;
    }
  }
}

function logOnce(source: Element, message: string): void {
  const state = stateOf(source);
  if (state.logged.has(message)) return;
  state.logged.add(message);
  console.error(`[Interactable] ${message}`);
}

function describeRef(ref: Ref): string {
  return ref.kind === "this" ? "this" : `#${ref.id}`;
}

function describeElement(el: Element): string {
  const localName = (el as { localName?: unknown }).localName;
  const tag = typeof localName === "string" && localName !== "" ? localName : (el as { tagName?: unknown }).tagName;
  const name = typeof tag === "string" && tag !== "" ? tag.toLowerCase() : "element";
  const id = (el as { id?: unknown }).id;
  const suffix = typeof id === "string" && id !== "" ? `#${id}` : "";
  return `<${name}${suffix}>`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}