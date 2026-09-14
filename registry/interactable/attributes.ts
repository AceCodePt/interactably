import type { CompiledSignature } from "@interactable/signature.ts";

export interface AttributeSlot {
  raw: string;
  sig: CompiledSignature;
}

export interface AttributeBindings {
  config: Readonly<Record<string, AttributeSlot>>;
  state: Readonly<Record<string, AttributeSlot>>;
}

export function bindAttributes(el: Element, name: string, def: AttributeBindings): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, key, _receiver): unknown {
      if (typeof key !== "string") return undefined;
      const config = def.config[key];
      if (config !== undefined) return readAttribute(el, `${name}-${key}`, config);
      const state = def.state[key];
      if (state !== undefined) return readAttribute(el, `data-${key}`, state);
      return undefined;
    },
    set(_target, key, value): boolean {
      if (typeof key !== "string") return true;
      const state = def.state[key];
      if (state !== undefined) {
        if (value === undefined || value === null) {
          el.removeAttribute(`data-${key}`);
          return true;
        }
        state.sig.validate(value);
        el.setAttribute(`data-${key}`, String(value));
        return true;
      }
      if (key in def.config) {
        throw new Error(`[Interactable] "${key}" is a config key and is read-only`);
      }
      return true;
    },
    has(_target, key): boolean {
      return typeof key === "string" && (key in def.config || key in def.state);
    },
  });
}

function readAttribute(el: Element, attribute: string, slot: AttributeSlot): unknown {
  const value = coerceAttribute(slot.raw, el.getAttribute(attribute));
  return slot.sig.validate(value);
}

function coerceAttribute(raw: string, attributeValue: string | null): unknown {
  if (attributeValue === null) return undefined;
  if (/\bnumber\b/.test(raw)) {
    if (attributeValue.trim() === "" || Number.isNaN(Number(attributeValue))) {
      throw new Error(`[Interactable] "${attributeValue}" is not a valid number for slot "${raw}"`);
    }
    return Number(attributeValue);
  }
  if (/\bbigint\b/.test(raw)) {
    try {
      return BigInt(attributeValue);
    } catch {
      throw new Error(`[Interactable] "${attributeValue}" is not a valid bigint for slot "${raw}"`);
    }
  }
  if (/\bboolean\b/.test(raw)) return attributeValue === "true";
  return attributeValue;
}