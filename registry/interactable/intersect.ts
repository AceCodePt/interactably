import { parse } from "@interactable/parser.ts";
import type { Phrase } from "@interactable/parser.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import {
  readMeasured,
  registerResizeListener,
  unregisterResizeListener,
} from "@interactable/measure.ts";

export const INTERSECT_EVENT_NAMES: ReadonlySet<string> = new Set([
  "intersect-enter",
  "intersect-leave",
  "intersect-full",
]);

export const INTERSECT_ATTRIBUTES: readonly string[] = [...INTERSECT_EVENT_NAMES].map(
  (name) => `on-${name}`,
);

const MARGIN_TOKEN =
  /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)|-?#[\w-]+\.(?:height|width))$/;

export function normaliseRootMargin(key?: string): string {
  if (key === undefined || key.trim() === "") return "0px";
  const tokens = key.trim().split(/\s+/);
  if (tokens.length > 4) throw new Error(`invalid root margin "${key}": at most 4 values`);
  for (const token of tokens) {
    if (!MARGIN_TOKEN.test(token)) {
      throw new Error(`invalid root margin "${key}": rootMargin accepts only px or %`);
    }
  }
  return tokens.join(" ");
}

const MARGIN_REF = /^(-?)#([\w-]+)\.(height|width)$/;

const THRESHOLDS: readonly number[] = Array.from({ length: 101 }, (_, index) => index / 100);

interface ObserverSpec {
  rootMargin: string;
  types: Set<string>;
}

interface ResolvedSpec {
  rootMargin: string;
  resolvedRootMargin: string;
  types: Set<string>;
  referenced: readonly Element[];
}

interface ManagedObserver {
  observer: IntersectionObserver;
  types: ReadonlySet<string>;
  resolvedRootMargin: string;
  refListeners: ReadonlyArray<{ ref: Element; listener: () => void }>;
}

const observersByElement = new WeakMap<Element, Map<string, ManagedObserver>>();

export function syncIntersect(el: Element): void {
  if (typeof IntersectionObserver === "undefined") return;
  const desired = resolveSpecs(collectSpecs(el), el);
  const existing = observersByElement.get(el);
  if (existing !== undefined && sameKeys(existing, desired)) return;
  teardownIntersect(el);
  const map = new Map<string, ManagedObserver>();
  for (const [key, spec] of desired) {
    let wasOverlapping = false;
    let wasFull = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          const inter = entry.intersectionRect;
          const overlapping = inter !== null && inter.width > 0 && inter.height > 0;
          const entered = !wasOverlapping && overlapping;
          const left = wasOverlapping && !overlapping;
          wasOverlapping = overlapping;
          const box = entry.rootBounds;
          const elRect = entry.boundingClientRect;
          const isFull =
            box !== null && elRect !== null && elRect.top >= box.top && elRect.bottom <= box.bottom;
          const fullChanged = isFull !== wasFull;
          wasFull = isFull;
          for (const type of spec.types) {
            if (type === "intersect-enter" && !entered) continue;
            if (type === "intersect-leave" && !left) continue;
            if (type === "intersect-full" && !fullChanged) continue;
            el.dispatchEvent(new ImplementationEvent(type, { key: spec.rootMargin }));
          }
        }
      },
      { rootMargin: spec.resolvedRootMargin, threshold: [...THRESHOLDS] },
    );
    observer.observe(el);
    const refListeners = spec.referenced.map((ref) => {
      const listener = (): void => syncIntersect(el);
      registerResizeListener(ref, el, listener);
      return { ref, listener };
    });
    map.set(key, {
      observer,
      types: spec.types,
      resolvedRootMargin: spec.resolvedRootMargin,
      refListeners,
    });
  }
  if (map.size > 0) observersByElement.set(el, map);
  else observersByElement.delete(el);
}

export function teardownIntersect(el: Element): void {
  const map = observersByElement.get(el);
  if (map === undefined) return;
  for (const managed of map.values()) {
    managed.observer.disconnect();
    for (const { ref, listener } of managed.refListeners) {
      unregisterResizeListener(ref, el, listener);
    }
  }
  observersByElement.delete(el);
}

function collectSpecs(el: Element): Map<string, ObserverSpec> {
  const specs = new Map<string, ObserverSpec>();
  for (const type of INTERSECT_EVENT_NAMES) {
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
      const spec = specs.get(rootMargin);
      if (spec === undefined) specs.set(rootMargin, { rootMargin, types: new Set([type]) });
      else spec.types.add(type);
    }
  }
  return specs;
}

// Resolution before first layout (the header not yet laid out at connect) yields 0.
// That is acceptable: the first ResizeObserver report rebuilds with the right number,
// and the element's initial-report enter fires against the corrected box.
function resolveSpecs(specs: Map<string, ObserverSpec>, el: Element): Map<string, ResolvedSpec> {
  const resolved = new Map<string, ResolvedSpec>();
  for (const [key, spec] of specs) {
    const result = resolveMargin(spec.rootMargin);
    if (result === null) {
      logOnce(el, `margin "${spec.rootMargin}" references an id that is not in the document`);
      continue;
    }
    resolved.set(key, {
      rootMargin: spec.rootMargin,
      resolvedRootMargin: result.resolved,
      types: spec.types,
      referenced: result.referenced,
    });
  }
  return resolved;
}

function resolveMargin(margin: string): { resolved: string; referenced: Element[] } | null {
  const tokens = margin.split(/\s+/);
  const parts: string[] = [];
  const referenced: Element[] = [];
  for (const token of tokens) {
    const resolved = resolveMarginToken(token);
    if (resolved === null) return null;
    parts.push(resolved.resolved);
    if (resolved.ref !== undefined && !referenced.includes(resolved.ref)) referenced.push(resolved.ref);
  }
  return { resolved: parts.join(" "), referenced };
}

function resolveMarginToken(
  token: string,
): { resolved: string; ref?: Element } | null {
  const match = MARGIN_REF.exec(token);
  if (match === null) return { resolved: token };
  const element = document.getElementById(match[2]!);
  if (element === null) return null;
  const px = Math.round(readMeasured(element, match[3] as "height" | "width"));
  return { resolved: px === 0 ? "0px" : `${match[1] ?? ""}${px}px`, ref: element };
}

function sameKeys(
  existing: Map<string, ManagedObserver>,
  desired: Map<string, ResolvedSpec>,
): boolean {
  if (existing.size !== desired.size) return false;
  for (const [key, spec] of desired) {
    const managed = existing.get(key);
    if (managed === undefined) return false;
    if (managed.resolvedRootMargin !== spec.resolvedRootMargin) return false;
    if (managed.types.size !== spec.types.size) return false;
    for (const type of spec.types) {
      if (!managed.types.has(type)) return false;
    }
  }
  return true;
}

const logged = new WeakMap<Element, Set<string>>();

function logOnce(el: Element, message: string): void {
  let set = logged.get(el);
  if (set === undefined) {
    set = new Set();
    logged.set(el, set);
  }
  if (set.has(message)) return;
  set.add(message);
  console.error(`[Interactable] ${message}`);
}