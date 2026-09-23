import { parseEventAttribute } from "@interactable/parser.ts";
import type { EventValueDeclaration } from "@interactable/parser.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { logOnce } from "@interactable/log.ts";
import {
  readMeasured,
  registerResizeListener,
  unregisterResizeListener,
} from "@interactable/measure.ts";

export const INTERSECT_EVENT_NAMES: ReadonlySet<string> = new Set(["intersect"]);

export function isIntersectAttribute(name: string): boolean {
  return name === "on-intersect" || name.startsWith("on-intersect(");
}

const MARGIN_TOKEN =
  /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)|-?#[\w-]+\.(?:height|width))$/;

export function normaliseRootMargin(token?: string): string {
  const value = token === undefined ? "" : token.trim();
  if (value === "") return "0px";
  if (!MARGIN_TOKEN.test(value)) {
    throw new Error(`invalid root margin "${token}": rootMargin accepts only px or %`);
  }
  return value;
}

export const MARGIN_SLOTS = ["block-start", "block-end", "inline-start", "inline-end"] as const;

export type MarginSlot = (typeof MARGIN_SLOTS)[number];

const STATE_VALUES: ReadonlySet<string> = new Set(["enter", "leave"]);
const FULL_VALUES: ReadonlySet<string> = new Set(["true", "false"]);

export interface IntersectSpec {
  margin: string;
  slots: Readonly<Record<MarginSlot, string>>;
  match: readonly EventValueDeclaration[];
}

export function readIntersectSpec(declaration?: readonly EventValueDeclaration[]): IntersectSpec {
  const slots: Record<MarginSlot, string> = {
    "block-start": "0px",
    "block-end": "0px",
    "inline-start": "0px",
    "inline-end": "0px",
  };
  const match: EventValueDeclaration[] = [];
  const seen = new Set<string>();
  for (const value of declaration ?? []) {
    if (seen.has(value.name)) throw new Error(`slot "${value.name}" is declared twice`);
    seen.add(value.name);
    if ((MARGIN_SLOTS as readonly string[]).includes(value.name)) {
      if (value.kind !== "literal") {
        throw new Error(`"${value.name}" configures the observer; write a backticked margin literal`);
      }
      slots[value.name as MarginSlot] = normaliseRootMargin(value.literal);
      continue;
    }
    if (value.name === "state") {
      if (value.kind !== "literal" || !STATE_VALUES.has(value.literal)) {
        throw new Error(`"state" matches only \`enter\` or \`leave\``);
      }
      match.push(value);
      continue;
    }
    if (value.name === "full") {
      if (value.kind !== "literal" || !FULL_VALUES.has(value.literal)) {
        throw new Error(`"full" matches only \`true\` or \`false\``);
      }
      match.push(value);
      continue;
    }
    throw new Error(
      `"${value.name}" is not a slot of intersect; ` +
        `expected state, full, block-start, block-end, inline-start or inline-end`,
    );
  }
  const margin = MARGIN_SLOTS.map((slot) => slots[slot]).join(" ");
  return { margin, slots, match };
}

const MARGIN_REF = /^(-?)#([\w-]+)\.(height|width)$/;

const THRESHOLDS: readonly number[] = Array.from({ length: 101 }, (_, index) => index / 100);

interface ObserverSpec {
  margin: string;
  slots: Readonly<Record<MarginSlot, string>>;
}

interface ResolvedSpec {
  margin: string;
  resolvedRootMargin: string;
  referenced: readonly Element[];
}

interface IntersectState {
  wasOverlapping: boolean;
  wasFull: boolean;
}

interface ManagedObserver {
  observer: IntersectionObserver;
  resolvedRootMargin: string;
  refListeners: ReadonlyArray<{ ref: Element; listener: () => void }>;
  state: IntersectState;
}

const observersByElement = new WeakMap<Element, Map<string, ManagedObserver>>();

export function syncIntersect(el: Element): void {
  if (typeof IntersectionObserver === "undefined") return;
  const { writingMode, direction } = readWritingMode(el);
  const desired = resolveSpecs(collectSpecs(el), el, writingMode, direction);
  const existing = observersByElement.get(el);
  if (existing !== undefined && sameKeys(existing, desired)) return;
  teardownIntersect(el);
  const map = new Map<string, ManagedObserver>();
  for (const [key, spec] of desired) {
    const state: IntersectState = existing?.get(key)?.state ?? {
      wasOverlapping: false,
      wasFull: false,
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          const inter = entry.intersectionRect;
          const overlapping = inter !== null && inter.width > 0 && inter.height > 0;
          const entered = !state.wasOverlapping && overlapping;
          const left = state.wasOverlapping && !overlapping;
          state.wasOverlapping = overlapping;
          const box = entry.rootBounds;
          const elRect = entry.boundingClientRect;
          const isFull =
            box !== null && elRect !== null && elRect.top >= box.top && elRect.bottom <= box.bottom;
          const fullChanged = isFull !== state.wasFull;
          state.wasFull = isFull;
          const values: Record<string, string> = {};
          if (entered) values["state"] = "enter";
          else if (left) values["state"] = "leave";
          if (fullChanged) values["full"] = isFull ? "true" : "false";
          if (Object.keys(values).length === 0) continue;
          el.dispatchEvent(new ImplementationEvent("intersect", { key: spec.margin, values }));
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
      resolvedRootMargin: spec.resolvedRootMargin,
      refListeners,
      state,
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
  for (const attribute of el.getAttributeNames()) {
    if (!isIntersectAttribute(attribute)) continue;
    let parsed;
    try {
      parsed = parseEventAttribute(attribute.slice(3));
    } catch {
      continue;
    }
    if (parsed.type !== "intersect") continue;
    let info: IntersectSpec;
    try {
      info = readIntersectSpec(parsed.declaration);
    } catch {
      continue;
    }
    if (!specs.has(info.margin)) specs.set(info.margin, { margin: info.margin, slots: info.slots });
  }
  return specs;
}

// Resolution before first layout (the header not yet laid out at connect) yields 0.
// That is acceptable: the first ResizeObserver report rebuilds with the right number,
// and the element's initial-report enter fires against the corrected box.
function resolveSpecs(
  specs: Map<string, ObserverSpec>,
  el: Element,
  writingMode: string,
  direction: string,
): Map<string, ResolvedSpec> {
  const resolved = new Map<string, ResolvedSpec>();
  for (const [key, spec] of specs) {
    const physical = mapToPhysical(spec.slots, writingMode, direction);
    const result = resolvePhysicalMargin(physical);
    if (result === null) {
      logOnce(el, `margin "${spec.margin}" references an id that is not in the document`);
      continue;
    }
    resolved.set(key, {
      margin: spec.margin,
      resolvedRootMargin: result.resolved,
      referenced: result.referenced,
    });
  }
  return resolved;
}

function mapToPhysical(
  slots: Readonly<Record<MarginSlot, string>>,
  writingMode: string,
  direction: string,
): string[] {
  const blockStart = slots["block-start"];
  const blockEnd = slots["block-end"];
  const inlineStart = slots["inline-start"];
  const inlineEnd = slots["inline-end"];
  if (writingMode === "vertical-rl" || writingMode === "sideways-rl") {
    return [inlineStart, blockStart, inlineEnd, blockEnd];
  }
  if (writingMode === "vertical-lr" || writingMode === "sideways-lr") {
    return [inlineStart, blockEnd, inlineEnd, blockStart];
  }
  return direction === "rtl"
    ? [blockStart, inlineStart, blockEnd, inlineEnd]
    : [blockStart, inlineEnd, blockEnd, inlineStart];
}

function readWritingMode(el: Element): { writingMode: string; direction: string } {
  try {
    const view = el.ownerDocument?.defaultView;
    const style = view?.getComputedStyle(el);
    return {
      writingMode: style?.writingMode || "horizontal-tb",
      direction: style?.direction || "ltr",
    };
  } catch {
    return { writingMode: "horizontal-tb", direction: "ltr" };
  }
}

function resolvePhysicalMargin(parts: readonly string[]): { resolved: string; referenced: Element[] } | null {
  const resolvedParts: string[] = [];
  const referenced: Element[] = [];
  for (const token of parts) {
    const resolved = resolveMarginToken(token);
    if (resolved === null) return null;
    resolvedParts.push(resolved.resolved);
    if (resolved.ref !== undefined && !referenced.includes(resolved.ref)) referenced.push(resolved.ref);
  }
  return { resolved: resolvedParts.join(" "), referenced };
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
  }
  return true;
}
