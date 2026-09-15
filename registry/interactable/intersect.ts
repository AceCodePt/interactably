import { parse } from "@interactable/parser.ts";
import type { Phrase } from "@interactable/parser.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const INTERSECT_THRESHOLDS = {
  "intersect-enter": 0,
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
  type: string;
  threshold: number;
  rootMargin: string;
}

const observersByElement = new WeakMap<Element, Map<string, IntersectionObserver>>();

export function syncIntersect(el: Element): void {
  if (typeof IntersectionObserver === "undefined") return;
  const desired = collectSpecs(el);
  const existing = observersByElement.get(el);
  if (existing !== undefined && sameKeys(existing, desired)) return;
  teardownIntersect(el);
  const map = new Map<string, IntersectionObserver>();
  for (const [key, spec] of desired) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          el.dispatchEvent(new ImplementationEvent(spec.type, { key: spec.rootMargin }));
        }
      },
      { rootMargin: spec.rootMargin, threshold: spec.threshold },
    );
    observer.observe(el);
    map.set(key, observer);
  }
  if (map.size > 0) observersByElement.set(el, map);
  else observersByElement.delete(el);
}

export function teardownIntersect(el: Element): void {
  const map = observersByElement.get(el);
  if (map === undefined) return;
  for (const observer of map.values()) observer.disconnect();
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
      const key = `${type}\u0000${rootMargin}`;
      if (!specs.has(key)) specs.set(key, { type, threshold, rootMargin });
    }
  }
  return specs;
}

function sameKeys(
  existing: Map<string, IntersectionObserver>,
  desired: Map<string, ObserverSpec>,
): boolean {
  if (existing.size !== desired.size) return false;
  for (const key of desired.keys()) {
    if (!existing.has(key)) return false;
  }
  return true;
}