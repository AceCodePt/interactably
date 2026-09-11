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
  for (const [key, slot] of Object.entries(sig)) fields.set(key, compileSlot(slot));

  return {
    validate(value: unknown): unknown {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`expected an object argument, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
      }
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, compiled] of fields) {
        if (!(key in record)) throw new Error(`missing "${key}"`);
        out[key] = compiled.validate(record[key]);
      }
      for (const key of Object.keys(record)) {
        if (!fields.has(key)) throw new Error(`unexpected key "${key}"`);
      }
      return out;
    },
  };
}