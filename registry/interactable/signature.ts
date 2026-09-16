import { dslString, parseValueAgainstDSL, SUPPORTED_KEYWORDS } from "tsyntax";
import type { DSLInfer, DSLValidate } from "tsyntax";

export type Ctor = abstract new (...args: never[]) => Element;
export type Slot = string | Ctor;
export type Sig = Slot | Readonly<Record<string, Slot>>;

export interface CompiledSignature {
  validate(value: unknown): unknown;
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
  return {
    validate(value: unknown): unknown {
      if (typeof value !== "object" || value === null) {
        throw new Error(`expected an element of type ${slot.name}, got ${value === null ? "null" : typeof value}`);
      }
      if (!(value instanceof slot)) {
        const actual = value.constructor?.name ?? typeof value;
        throw new Error(`expected ${slot.name}, got ${actual}`);
      }
      return value;
    },
  };
}

export function compileSignature(sig: Sig): CompiledSignature {
  if (typeof sig === "string" || typeof sig === "function") {
    return compileSlot(sig);
  }
  const fields = new Map<string, CompiledSignature>();
  const optional = new Set<string>();
  for (const [key, slot] of Object.entries(sig)) {
    const compiled = compileSlot(slot);
    fields.set(key, compiled);
    if (acceptsUndefined(compiled)) optional.add(key);
  }

  return {
    validate(value: unknown): unknown {
      if (value === undefined && optional.size === fields.size) return undefined;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`expected an object argument, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
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
        if (!fields.has(key)) throw new Error(`unexpected key "${key}"`);
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