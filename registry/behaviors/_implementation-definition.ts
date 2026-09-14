import { SUPPORTED_KEYWORDS, dslString } from "tsyntax";
import type { DSLInfer, DSLValidate } from "tsyntax";
import { compileSignature } from "@interactable/signature.ts";
import type { CompiledSignature, Ctor, Sig } from "@interactable/signature.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import { registerImplementation } from "@behaviors/implementation-registry.ts";
import type { NormalizedImplementationDef } from "@behaviors/implementation-registry.ts";

export type { Ctor, Sig } from "@interactable/signature.ts";

export type Tag = keyof HTMLElementTagNameMap;

export type El<T extends readonly Tag[] | undefined> = T extends readonly Tag[]
  ? HTMLElementTagNameMap[T[number]]
  : HTMLElement;

export type Slot = string | Ctor;

export type KW = typeof SUPPORTED_KEYWORDS;

type SlotOf<S extends Slot> = S extends string ? DSLInfer<KW, S> : S extends Ctor ? InstanceType<S> : never;

export type ArgOf<S extends Sig> = S extends Slot ? SlotOf<S> : { [K in keyof S]: S[K] extends Slot ? SlotOf<S[K]> : never };

export type Attrs<C extends Record<string, string>, S extends Record<string, string>> =
  { [K in keyof C]: DSLInfer<KW, C[K]> } & { -readonly [K in keyof S]: DSLInfer<KW, S[K]> };

export type Implementation<V extends Record<string, Sig>> = ImplementationInstance & {
  [K in keyof V]: (e: InteractionEvent, arg: ArgOf<V[K]>) => unknown;
};

type Validated<C extends Record<string, string>> = { [K in keyof C]: DSLValidate<KW, C[K]> };

type ValidatedSlot<S extends Slot> = S extends string ? DSLValidate<KW, S> : S;

type ValidatedSig<S extends Sig> = S extends Slot
  ? ValidatedSlot<S>
  : { [K in keyof S]: ValidatedSlot<S[K] & Slot> };

export type ValidatedSigs<V extends Record<string, Sig>> = { [K in keyof V]: ValidatedSig<V[K]> };

export interface ImplementationDef<
  T extends readonly Tag[] | undefined,
  C extends Record<string, string>,
  S extends Record<string, string>,
  V extends Record<string, Sig>,
> {
  readonly name: string;
  readonly tags: T | undefined;
  readonly config: Validated<C> | undefined;
  readonly state: Validated<S> | undefined;
  readonly verbs: ValidatedSigs<V>;
  readonly factory: (el: El<T>, attrs: Attrs<C, S>) => Implementation<V>;
}

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
  },
  factory: (el: El<T>, attrs: Attrs<C, S>) => Implementation<V>,
): ImplementationDef<T, C, S, V> {
  validateSlots(name, decl.config ?? {}, decl.state ?? {}, decl.verbs);
  registerImplementation({
    name,
    tags: decl.tags,
    config: compileAttrs(decl.config ?? {}),
    state: compileAttrs(decl.state ?? {}),
    verbs: compileVerbs(decl.verbs),
    factory: factory as unknown as NormalizedImplementationDef["factory"],
  });
  return { name, tags: decl.tags, config: decl.config, state: decl.state, verbs: decl.verbs, factory };
}

function validateSlots(
  name: string,
  config: Record<string, string>,
  state: Record<string, string>,
  verbs: Record<string, Sig>,
): void {
  for (const [key, raw] of Object.entries(config)) validateScalar(name, `config "${key}"`, raw);
  for (const [key, raw] of Object.entries(state)) validateScalar(name, `state "${key}"`, raw);
  for (const [verb, sig] of Object.entries(verbs)) validateVerbSlot(name, verb, sig);
}

function validateVerbSlot(name: string, verb: string, sig: Sig): void {
  if (typeof sig === "string") {
    validateScalar(name, `verb ${verb}()`, sig);
  } else if (typeof sig !== "function") {
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