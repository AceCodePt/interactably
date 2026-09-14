import { SUPPORTED_KEYWORDS } from "tsyntax";
import type { DSLInfer, DSLValidate } from "tsyntax";
import type { Ctor, Sig } from "@interactable/signature.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";

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

export type Validated<C extends Record<string, string>> = { [K in keyof C]: DSLValidate<KW, C[K]> };

export type ValidatedSlot<S extends Slot> = S extends string ? DSLValidate<KW, S> : S;

export type ValidatedSig<S extends Sig> = S extends Slot
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