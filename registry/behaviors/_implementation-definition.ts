import { SUPPORTED_KEYWORDS, dslString } from "tsyntax";
import type { DSLValidate } from "tsyntax";
import { compileSignature, exclusivePair, isExclusiveSlot, isOptionalCtor } from "@interactable/signature.ts";
import type { CompiledSignature, Sig } from "@interactable/signature.ts";
import { registerImplementation } from "@behaviors/implementation-registry.ts";
import type { NormalizedImplementationDef } from "@behaviors/implementation-registry.ts";
import type { Attrs, El, Implementation, ImplementationDef, KW, Tag, Validated, ValidatedSigs } from "@behaviors/types.ts";

export type { Ctor, OptionalCtor, Sig, Tag, El, Slot, KW, ArgOf, Attrs, Implementation, ValidatedSigs, ImplementationDef } from "@behaviors/types.ts";

export function defineImplementation<
  const T extends readonly Tag[] | undefined,
  const C extends Record<string, string> = {},
  const S extends Record<string, string> = {},
  const V extends Record<string, Sig> = {},
>(
  name: string,
  decl: {
    tags?: T;
    config?: Validated<C>;
    state?: Validated<S>;
    verbs: V & ValidatedSigs<V>;
    events?: readonly string[];
  },
  factory: (el: El<T>, attrs: Attrs<C, S>) => Implementation<V>,
): ImplementationDef<T, C, S, V> {
  const events = decl.events ?? [];
  validateEvents(name, events);
  validateSlots(name, decl.config ?? {}, decl.state ?? {}, decl.verbs);
  registerImplementation({
    name,
    tags: decl.tags,
    config: compileAttrs(decl.config ?? {}),
    state: compileAttrs(decl.state ?? {}),
    verbs: compileVerbs(decl.verbs),
    events,
    factory: factory as unknown as NormalizedImplementationDef["factory"],
  });
  return { name, tags: decl.tags, config: decl.config, state: decl.state, verbs: decl.verbs, events, factory };
}

function validateEvents(name: string, events: readonly string[]): void {
  for (const event of events) {
    if (typeof event !== "string" || event.trim() === "") {
      throw new Error(`[Interactable] ${name} events: "${String(event)}" is not a valid event name`);
    }
  }
}

const RESERVED_VERB_NAMES = new Set(["debounce", "throttle", "once", "delay"]);

function validateSlots(
  name: string,
  config: Record<string, string>,
  state: Record<string, string>,
  verbs: Record<string, Sig>,
): void {
  for (const key of Object.keys(state)) {
    if (key in config) {
      throw new Error(
        `[Interactable] ${name}: "${key}" is declared as both config ("${config[key]}") and state ("${state[key]}"); ` +
          `config and state share the <name>-<key> attribute namespace`,
      );
    }
  }
  for (const [key, raw] of Object.entries(config)) validateScalar(name, `config "${key}"`, raw);
  for (const [key, raw] of Object.entries(state)) validateScalar(name, `state "${key}"`, raw);
  for (const [verb, sig] of Object.entries(verbs)) {
    if (RESERVED_VERB_NAMES.has(verb)) {
      throw new Error(
        `[Interactable] ${name} verb ${verb}(): "${verb}" is a reserved modifier and cannot be a verb`,
      );
    }
    validateVerbSlot(name, verb, sig);
  }
}

function validateVerbSlot(name: string, verb: string, sig: Sig): void {
  if (typeof sig === "string") {
    validateScalar(name, `verb ${verb}()`, sig);
  } else if (isExclusiveSlot(sig)) {
    validateVerbSlot(name, verb, exclusivePair(sig).slot);
  } else if (typeof sig !== "function" && !isOptionalCtor(sig)) {
    for (const [key, slot] of Object.entries(sig)) validateVerbSlot(name, `${verb}.${key}`, slot);
  }
}

function validateScalar(name: string, where: string, raw: string): void {
  try {
    dslString(SUPPORTED_KEYWORDS, raw as DSLValidate<KW, string>);
  } catch (err) {
    throw new Error(`[Interactable] ${name} ${where}: "${raw}" is not a valid signature (${(err as Error).message})`);
  }
}

function compileAttrs(attrs: Record<string, string>): Record<string, { raw: string; sig: CompiledSignature }> {
  const out: Record<string, { raw: string; sig: CompiledSignature }> = {};
  for (const [key, raw] of Object.entries(attrs)) out[key] = { raw, sig: compileSignature(raw) };
  return out;
}

function compileVerbs(verbs: Record<string, Sig>): Record<string, CompiledSignature> {
  const out: Record<string, CompiledSignature> = {};
  for (const [verb, sig] of Object.entries(verbs)) out[verb] = compileSignature(sig);
  return out;
}