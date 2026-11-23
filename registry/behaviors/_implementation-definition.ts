import { SUPPORTED_KEYWORDS, dslString } from "tsyntax";
import type { DSLValidate } from "tsyntax";
import { compileSignature, exclusivePair, isExclusiveSlot, isOptionalCtor, isScalarOrSlot } from "@interactable/signature.ts";
import type { CompiledSignature, Sig } from "@interactable/signature.ts";
import { registerImplementation } from "@behaviors/implementation-registry.ts";
import type { NormalizedImplementationDef } from "@behaviors/implementation-registry.ts";
import type { Attrs, El, EventSpec, Implementation, ImplementationDef, KW, Tag, Validated, ValidatedSigs } from "@behaviors/types.ts";

export type { Ctor, OptionalCtor, Sig, Tag, El, Slot, KW, ArgOf, Attrs, Implementation, ValidatedSigs, ImplementationDef } from "@behaviors/types.ts";

const IMPLEMENTATION_NAME = /^[a-z][a-z0-9-]*$/;

const RESERVED_IMPLEMENTATION_NAMES: ReadonlySet<string> = new Set([
  "implements",
  "implementations",
  "intersect",
]);

const RESERVED_NAME_PREFIXES = ["on-", "aria-", "data-"] as const;

export const NATIVE_HTML_ATTRIBUTES: ReadonlySet<string> = new Set([
  "accept",
  "accept-charset",
  "accesskey",
  "action",
  "allow",
  "allowfullscreen",
  "alt",
  "async",
  "autocapitalize",
  "autocomplete",
  "autocorrect",
  "autofocus",
  "autoplay",
  "border",
  "capture",
  "charset",
  "checked",
  "cite",
  "class",
  "cols",
  "colspan",
  "content",
  "contenteditable",
  "controls",
  "coords",
  "crossorigin",
  "datetime",
  "decoding",
  "default",
  "defer",
  "dir",
  "dirname",
  "disabled",
  "download",
  "draggable",
  "enctype",
  "enterkeyhint",
  "exportparts",
  "fetchpriority",
  "for",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "headers",
  "height",
  "hidden",
  "high",
  "href",
  "hreflang",
  "http-equiv",
  "id",
  "inert",
  "inputmode",
  "integrity",
  "is",
  "ismap",
  "itemid",
  "itemprop",
  "itemref",
  "itemscope",
  "itemtype",
  "kind",
  "label",
  "lang",
  "list",
  "loading",
  "loop",
  "low",
  "max",
  "maxlength",
  "media",
  "method",
  "min",
  "minlength",
  "multiple",
  "muted",
  "name",
  "nomodule",
  "nonce",
  "novalidate",
  "open",
  "optimum",
  "part",
  "pattern",
  "placeholder",
  "playsinline",
  "popover",
  "poster",
  "preload",
  "readonly",
  "referrerpolicy",
  "rel",
  "required",
  "reversed",
  "role",
  "rows",
  "rowspan",
  "sandbox",
  "scope",
  "selected",
  "shape",
  "size",
  "sizes",
  "slot",
  "span",
  "spellcheck",
  "src",
  "srcdoc",
  "srclang",
  "srcset",
  "start",
  "step",
  "style",
  "tabindex",
  "target",
  "title",
  "translate",
  "type",
  "usemap",
  "value",
  "width",
  "wrap",
  "writingsuggestions",
]);

function validateImplementationName(name: string): void {
  if (!IMPLEMENTATION_NAME.test(name)) {
    throw new Error(
      `[Interactable] implementation name "${name}" is not a valid attribute name; ` +
        `expected lowercase [a-z][a-z0-9-]*`,
    );
  }
  if (RESERVED_IMPLEMENTATION_NAMES.has(name)) {
    throw new Error(`[Interactable] implementation name "${name}" collides with the reserved "${name}" attribute`);
  }
  for (const prefix of RESERVED_NAME_PREFIXES) {
    if (name.startsWith(prefix)) {
      throw new Error(`[Interactable] implementation name "${name}" collides with the reserved "${prefix}" prefix`);
    }
  }
  if (NATIVE_HTML_ATTRIBUTES.has(name)) {
    throw new Error(`[Interactable] implementation name "${name}" collides with the native HTML attribute "${name}"`);
  }
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
    events?: Readonly<Record<string, EventSpec>>;
  },
  factory: (el: El<T>, attrs: Attrs<C, S>) => Implementation<V>,
): ImplementationDef<T, C, S, V> {
  validateImplementationName(name);
  const events = decl.events ?? {};
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

function validateEvents(name: string, events: Readonly<Record<string, EventSpec>>): void {
  for (const [eventName, spec] of Object.entries(events)) {
    if (eventName.trim() === "") {
      throw new Error(`[Interactable] ${name} events: "" is not a valid event name`);
    }
    for (const [field, raw] of Object.entries(spec.fields ?? {})) {
      if (field.trim() === "") {
        throw new Error(`[Interactable] ${name} event "${eventName}": "" is not a valid field name`);
      }
      validateScalar(name, `event "${eventName}" field "${field}"`, raw);
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
  } else if (isScalarOrSlot(sig)) {
    return;
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