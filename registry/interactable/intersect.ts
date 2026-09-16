import { parse } from "@interactable/parser.ts";
import type { Phrase } from "@interactable/parser.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const INTERSECT_THRESHOLDS = {
  "intersect-enter": 0,
  "intersect-leave": 0,
  "intersect-half": 0.5,
  "intersect-full": 1,
} as const;

export const INTERSECT_EVENT_NAMES: ReadonlySet<string> = new Set(Object.keys(INTERSECT_THRESHOLDS));

export const INTERSECT_ATTRIBUTES: readonly string[] = [...INTERSECT_EVENT_NAMES].map(
  (name) => `on-${name}`,
);

const MARGIN_TOKEN =
  /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%|vh|vw|vmin|vmax|cm|mm|in|pt|pc|ex|ch|q))$/;

export function normaliseRootMargin(key?: string): string {
  if (key === undefined || key.trim() === "") return "0px";
  const tokens = key.trim().split(/\s+/);
  if (tokens.length > 4) throw new Error(`invalid root margin "${key}": at most 4 values`);
  for (const token of tokens) {
    if (!MARGIN_TOKEN.test(token)) {
      throw new Error(`invalid root margin "${key}": "${token}" is not a CSS length or percentage`);
    }
  }
  return tokens.join(" ");
}

interface ObserverSpec {
  threshold: number;
  rootMargin: string;
  types: Set<string>;
}

interface ManagedObserver {
  observer: IntersectionObserver;
  types: ReadonlySet<string>;
}

const observersByElement = new WeakMap<Element, Map<string, ManagedObserver>>();

export function syncIntersect(el: Element): void {
  if (typeof IntersectionObserver === "undefined") return;
  const desired = collectSpecs(el);
  const existing = observersByElement.get(el);
  if (existing !== undefined && sameKeys(existing, desired)) return;
  teardownIntersect(el);
  const map = new Map<string, ManagedObserver>();
  for (const [key, spec] of desired) {
    let wasIntersecting = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          const isIntersecting = entry.isIntersecting;
          const entered = !wasIntersecting && isIntersecting;
          const left = wasIntersecting && !isIntersecting;
          wasIntersecting = isIntersecting;
          for (const type of spec.types) {
            if (type === "intersect-enter" && !entered) continue;
            if (type === "intersect-leave" && !left) continue;
            el.dispatchEvent(new ImplementationEvent(type, { key: spec.rootMargin }));
          }
        }
      },
      { rootMargin: spec.rootMargin, threshold: spec.threshold },
    );
    observer.observe(el);
    map.set(key, { observer, types: spec.types });
  }
  if (map.size > 0) observersByElement.set(el, map);
  else observersByElement.delete(el);
}

export function teardownIntersect(el: Element): void {
  const map = observersByElement.get(el);
  if (map === undefined) return;
  for (const managed of map.values()) managed.observer.disconnect();
  observersByElement.delete(el);
}

function collectSpecs(el: Element): Map<string, ObserverSpec> {
  const specs = new Map<string, ObserverSpec>();
  for (const [type, threshold] of Object.entries(INTERSECT_THRESHOLDS)) {
    const value = el.getAttribute(`on-${type}`);
    if (value === null) continue;
    let phrases: Phrase[];
    try {
      phrases = parse(value, type);
    } catch {
      continue;
    }
    for (const phrase of phrases) {
      const rootMargin = normaliseRootMargin(phrase.key);
      const key = `${threshold}\u0000${rootMargin}`;
      const spec = specs.get(key);
      if (spec === undefined) specs.set(key, { threshold, rootMargin, types: new Set([type]) });
      else spec.types.add(type);
    }
  }
  return specs;
}

function sameKeys(
  existing: Map<string, ManagedObserver>,
  desired: Map<string, ObserverSpec>,
): boolean {
  if (existing.size !== desired.size) return false;
  for (const [key, spec] of desired) {
    const managed = existing.get(key);
    if (managed === undefined) return false;
    if (managed.types.size !== spec.types.size) return false;
    for (const type of spec.types) {
      if (!managed.types.has(type)) return false;
    }
  }
  return true;
}