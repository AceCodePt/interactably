import { defineInteractableHost } from "@behaviors/interactable-host.ts";
import { bindAttributes } from "@interactable/attributes.ts";
import type { CompiledSignature } from "@interactable/signature.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";

export interface AttributeSlot {
  raw: string;
  sig: CompiledSignature;
}

export interface NormalizedImplementationDef {
  name: string;
  tags: readonly Tag[] | undefined;
  config: Record<string, AttributeSlot>;
  state: Record<string, AttributeSlot>;
  verbs: Record<string, CompiledSignature>;
  factory: (el: Element, attrs: Record<string, unknown>) => ImplementationInstance;
}

const definitions = new Map<string, NormalizedImplementationDef>();
const instancesByElement = new WeakMap<Element, Map<string, ImplementationInstance>>();

export function registerImplementation(def: NormalizedImplementationDef): NormalizedImplementationDef {
  if (definitions.has(def.name)) {
    throw new Error(`[Interactable] implementation "${def.name}" is already registered`);
  }
  for (const [otherName, other] of definitions) {
    for (const key of Object.keys(def.state)) {
      const existing = other.state[key];
      if (existing !== undefined && existing.raw !== def.state[key]!.raw) {
        throw new Error(
          `[Interactable] state key "data-${key}" is registered by "${otherName}" as "${existing.raw}" ` +
            `and by "${def.name}" as "${def.state[key]!.raw}"; two implementations inventing the same data-* must mean the same thing`,
        );
      }
    }
  }
  definitions.set(def.name, def);
  try {
    for (const tag of def.tags ?? []) defineInteractableHost(tag);
  } catch (err) {
    definitions.delete(def.name);
    throw err;
  }
  return def;
}

export function getImplementationDef(name: string): NormalizedImplementationDef | undefined {
  return definitions.get(name);
}

export function getObservedAttributes(def: NormalizedImplementationDef): string[] {
  return [
    ...Object.keys(def.config).map((key) => `${def.name}-${key}`),
    ...Object.keys(def.state).map((key) => `data-${key}`),
  ];
}

export function allObservedAttributes(): string[] {
  const seen = new Set<string>();
  for (const def of definitions.values()) {
    for (const attribute of getObservedAttributes(def)) seen.add(attribute);
  }
  return [...seen];
}

export function ensureImplementation(
  el: Element,
  name: string,
  def: NormalizedImplementationDef,
): Promise<ImplementationInstance> {
  return Promise.resolve().then(() => {
    let map = instancesByElement.get(el);
    if (map === undefined) {
      map = new Map();
      instancesByElement.set(el, map);
    }
    let implementation = map.get(name);
    if (implementation === undefined) {
      const attrs = bindAttributes(el, name, def) as Record<string, unknown>;
      implementation = def.factory(el, attrs);
      map.set(name, implementation);
    }
    return implementation;
  });
}