import { defineInteractableHost } from "@behaviors/interactable-host.ts";
import type { InteractableHost } from "@behaviors/interactable-host.ts";
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
  events: readonly string[];
  factory: (el: Element, attrs: Record<string, unknown>) => ImplementationInstance;
}

const definitions = new Map<string, NormalizedImplementationDef>();
const instancesByElement = new WeakMap<Element, Map<string, ImplementationInstance>>();
const connectedHosts = new Set<InteractableHost>();

export const REGISTRY_CHANGED_EVENT = "interactably:register";

export function trackConnectedHost(host: InteractableHost): void {
  connectedHosts.add(host);
}

export function untrackConnectedHost(host: InteractableHost): void {
  connectedHosts.delete(host);
}

export function registerImplementation(def: NormalizedImplementationDef): NormalizedImplementationDef {
  if (definitions.has(def.name)) {
    throw new Error(`[Interactable] implementation "${def.name}" is already registered`);
  }
  for (const [otherName, other] of definitions) {
    for (const event of def.events) {
      if (other.events.includes(event) && tagsOverlap(def.tags, other.tags)) {
        throw new Error(
          `[Interactable] event "${event}" is registered by both "${otherName}" and "${def.name}"; ` +
            `two implementations on the same tag cannot claim the same event`,
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
  for (const host of connectedHosts) host.ensureImplementations();
  if (typeof document !== "undefined") {
    document.dispatchEvent(new Event(REGISTRY_CHANGED_EVENT));
  }
  return def;
}

export function getImplementationDef(name: string): NormalizedImplementationDef | undefined {
  return definitions.get(name);
}

function tagsOverlap(a: readonly Tag[] | undefined, b: readonly Tag[] | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  return a.some((tag) => b.includes(tag));
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