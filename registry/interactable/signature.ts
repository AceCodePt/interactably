import { dslString, parseValueAgainstDSL, SUPPORTED_KEYWORDS } from "tsyntax";
import type { DSLInfer, DSLValidate } from "tsyntax";

export type Ctor = abstract new (...args: never[]) => Element;

const OPTIONAL_CTOR = Symbol("optionalCtor");

export interface OptionalCtor<C extends Ctor = Ctor> {
  readonly [OPTIONAL_CTOR]: C;
}

export function optionalCtor<C extends Ctor>(ctor: C): OptionalCtor<C> {
  return { [OPTIONAL_CTOR]: ctor } as OptionalCtor<C>;
}

export function isOptionalCtor(slot: unknown): slot is OptionalCtor {
  return typeof slot === "object" && slot !== null && OPTIONAL_CTOR in slot;
}

export type Slot = string | Ctor | OptionalCtor;
export type Sig = Slot | Readonly<Record<string, Slot>>;

export interface CompiledSignature {
  validate(value: unknown): unknown;
}

function ctorSignature(ctor: Ctor, optional: boolean): CompiledSignature {
  return {
    validate(value: unknown): unknown {
      if (value === undefined && optional) return undefined;
      if (typeof value !== "object" || value === null) {
        throw new Error(
          `expected an element of type ${ctor.name}, got ${value === null ? "null" : typeof value}`,
        );
      }
      if (!(value instanceof ctor)) {
        const actual = value.constructor?.name ?? typeof value;
        throw new Error(`expected ${ctor.name}, got ${actual}`);
      }
      return value;
    },
  };
}

function compileSlot(slot: Slot): CompiledSignature {
  if (typeof slot === "string") {
    dslString(SUPPORTED_KEYWORDS, slot as DSLValidate<typeof SUPPORTED_KEYWORDS, string>);
    return {
      validate(value: unknown): unknown {
        return parseValueAgainstDSL(
          SUPPORTED_KEYWORDS,
          slot as DSLValidate<typeof SUPPORTED_KEYWORDS, string>,
          value as DSLInfer<typeof SUPPORTED_KEYWORDS, string>,
        );
      },
    };
  }
  if (typeof slot === "function") return ctorSignature(slot, false);
  if (isOptionalCtor(slot)) return ctorSignature(slot[OPTIONAL_CTOR], true);
  throw new Error("invalid signature slot");
}

export function compileSignature(sig: Sig): CompiledSignature {
  if (typeof sig === "string" || typeof sig === "function" || isOptionalCtor(sig)) {
    return compileSlot(sig);
  }
  const fields = new Map<string, CompiledSignature>();
  const optional = new Set<string>();
  let rest: CompiledSignature | undefined;
  for (const [key, slot] of Object.entries(sig)) {
    const compiled = compileSlot(slot);
    if (key === "*") {
      rest = compiled;
      continue;
    }
    fields.set(key, compiled);
    if (acceptsUndefined(compiled)) optional.add(key);
  }

  return {
    validate(value: unknown): unknown {
      if (value === undefined && optional.size === fields.size) return undefined;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          `expected an object argument, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`,
        );
      }
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, compiled] of fields) {
        if (!(key in record)) {
          if (optional.has(key)) continue;
          throw new Error(`missing "${key}"`);
        }
        out[key] = compiled.validate(record[key]);
      }
      for (const key of Object.keys(record)) {
        if (fields.has(key)) continue;
        if (rest === undefined) throw new Error(`unexpected key "${key}"`);
        out[key] = rest.validate(record[key]);
      }
      return out;
    },
  };
}

function acceptsUndefined(compiled: CompiledSignature): boolean {
  try {
    compiled.validate(undefined);
    return true;
  } catch {
    return false;
  }
}