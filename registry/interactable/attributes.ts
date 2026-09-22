import type { CompiledSignature } from "@interactable/signature.ts";
import { describeElement } from "@interactable/describe-element.ts";

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
      if (state !== undefined) return readAttribute(el, `${name}-${key}`, state);
      return undefined;
    },
    set(_target, key, value): boolean {
      if (typeof key !== "string") return true;
      const state = def.state[key];
      if (state !== undefined) {
        if (value === undefined || value === null) {
          el.removeAttribute(`${name}-${key}`);
          return true;
        }
        state.sig.validate(value);
        el.setAttribute(`${name}-${key}`, String(value));
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
  const value = coerceAttribute(slot, el, attribute, el.getAttribute(attribute));
  try {
    return slot.sig.validate(value);
  } catch (err) {
    throw new Error(`[Interactable] ${attribute} on ${describeElement(el)}: ${(err as Error).message}`);
  }
}

function coerceAttribute(slot: AttributeSlot, el: Element, attribute: string, attributeValue: string | null): unknown {
  if (attributeValue === null) return undefined;
  const candidates: unknown[] = [];
  if (attributeValue.trim() !== "") {
    const number = Number(attributeValue);
    if (Number.isFinite(number)) candidates.push(number);
    try {
      candidates.push(BigInt(attributeValue));
    } catch {}
  }
  candidates.push(attributeValue === "false" ? false : true);
  candidates.push(attributeValue);
  for (const candidate of candidates) {
    try {
      return slot.sig.validate(candidate);
    } catch {}
  }
  throw new Error(
    `[Interactable] ${attribute}="${attributeValue}" on ${describeElement(el)}: not a valid value for "${slot.raw}"`,
  );
}