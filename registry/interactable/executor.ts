import { parse } from "@interactable/parser.ts";
import { matchesKey } from "@interactable/keys.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";
import type { Arg, Modifier, Phrase, Ref } from "@interactable/parser.ts";

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
  if (state.spentOnce.has(key)) return;

  const execute = (): void => {
    try {
      const completed = runChain(source, phrase, ev);
      if (completed && phrase.modifiers.some((m) => m.kind === "once")) {
        state.spentOnce.add(key);
      }
    } catch (err) {
      console.error("[Interactable]", err);
    }
  };

  const timing = phrase.modifiers.find(
    (m): m is Modifier & { kind: "debounce" | "throttle" } => m.kind === "debounce" || m.kind === "throttle",
  );
  if (timing === undefined) {
    execute();
    return;
  }
  if (timing.kind === "debounce") {
    scheduleDebounce(source, key, timing.ms, execute);
  } else {
    scheduleThrottle(source, key, timing.ms, execute);
  }
}

function runChain(source: Element, phrase: Phrase, ev: Event): boolean {
  const receiver = resolveRef(phrase.ref, source);
  if (receiver === null) {
    logOnce(source, `receiver ${describeRef(phrase.ref)} not found; phrase skipped`);
    return false;
  }

  for (const call of phrase.calls) {
    let arg: unknown;
    try {
      arg = resolveArg(call.arg, source);
    } catch (err) {
      logOnce(source, `argument for ${call.verb}(): ${(err as Error).message}; phrase skipped`);
      return false;
    }

    const event = new InteractionEvent({ verb: call.verb, arg, source, originalEvent: ev });
    receiver.dispatchEvent(event);

    if (!event.handled) {
      logOnce(source, `no implementation on ${describeElement(receiver)} handles ${call.verb}()`);
      return false;
    }
    if (event.error !== undefined) {
      logOnce(source, `${call.verb}() on ${describeElement(receiver)} threw: ${describeError(event.error)}`);
      return false;
    }
    if (event.defaultPrevented) return false;
  }
  return true;
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

function scheduleDebounce(
  source: Element,
  key: string,
  ms: number,
  fn: () => void,
): void {
  const state = stateOf(source);
  const existing = state.timers.get(key);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    state.timers.delete(key);
    fn();
  }, ms);
  state.timers.set(key, timer);
}

function scheduleThrottle(
  source: Element,
  key: string,
  ms: number,
  fn: () => void,
): void {
  const state = stateOf(source);
  const last = state.throttles.get(key) ?? 0;
  const now = Date.now();
  if (now - last >= ms) {
    state.throttles.set(key, now);
    fn();
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