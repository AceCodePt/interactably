import { attachCarrying, ensureAttachment } from "@interactable/attachment.ts";
import { bindAttributes } from "@interactable/attributes.ts";
import type { CompiledSignature } from "@interactable/signature.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";
import type { EventSpec } from "@behaviors/types.ts";

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
  events: Readonly<Record<string, EventSpec>>;
  factory: (el: Element, attrs: Record<string, unknown>) => ImplementationInstance;
}

const definitions = new Map<string, NormalizedImplementationDef>();
const eventOwners = new Map<string, string>();
const instancesByElement = new WeakMap<Element, Map<string, ImplementationInstance>>();
const attached = new Set<Element>();

export const REGISTRY_CHANGED_EVENT = "interactably:register";

export function track(el: Element): void {
  attached.add(el);
}

export function untrack(el: Element): void {
  attached.delete(el);
}

export function registerImplementation(def: NormalizedImplementationDef): NormalizedImplementationDef {
  if (definitions.has(def.name)) {
    throw new Error(`[Interactable] implementation "${def.name}" is already registered`);
  }
  for (const [otherName, other] of definitions) {
    for (const event of Object.keys(def.events)) {
      if (Object.hasOwn(other.events, event)) {
        throw new Error(
          `[Interactable] event "${event}" is registered by both "${otherName}" and "${def.name}"; ` +
            `event names are unique across all implementations`,
        );
      }
    }
  }
  definitions.set(def.name, def);
  for (const event of Object.keys(def.events)) eventOwners.set(event, def.name);
  for (const el of attached) ensureAttachment(el);
  if (typeof document !== "undefined") {
    attachCarrying(def.name);
    document.dispatchEvent(new Event(REGISTRY_CHANGED_EVENT));
  }
  return def;
}

export function getImplementationDef(name: string): NormalizedImplementationDef | undefined {
  return definitions.get(name);
}

export function implementationOwningEvent(event: string): NormalizedImplementationDef | undefined {
  const name = eventOwners.get(event);
  return name === undefined ? undefined : definitions.get(name);
}

export function presentImplementationNames(el: Element): string[] {
  const names: string[] = [];
  for (const attribute of el.getAttributeNames()) {
    if (definitions.has(attribute)) names.push(attribute);
  }
  return names;
}

export function getObservedAttributes(def: NormalizedImplementationDef): string[] {
  return Object.keys({ ...def.config, ...def.state }).map((key) => `${def.name}-${key}`);
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
): ImplementationInstance {
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
}
