import { parseEventValueWithErrors } from "@interactable/parser.ts";
import type { EventHandler } from "@interactable/parser.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { logOnce } from "@interactable/log.ts";
import {
  readMeasured,
  registerResizeListener,
  unregisterResizeListener,
} from "@interactable/measure.ts";

export const INTERSECT_EVENT_NAMES: ReadonlySet<string> = new Set(["intersect"]);

const MARGIN_TOKEN =
  /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)|-?#[\w-]+\.(?:height|width))$/;

export function normaliseRootMargin(token?: string | number): string {
  const value = token === undefined ? "" : String(token).trim();
  if (value === "") return "0px";
  if (!MARGIN_TOKEN.test(value)) {
    throw new Error(`invalid root margin "${token}": rootMargin accepts only px or %`);
  }
  return value;
}

export const MARGIN_SLOTS = ["block-start", "block-end", "inline-start", "inline-end"] as const;

export type MarginSlot = (typeof MARGIN_SLOTS)[number];

export interface IntersectSpec {
  margin: string;
  slots: Readonly<Record<MarginSlot, string>>;
  declared: readonly MarginSlot[];
}

export function readIntersectSpec(handlers: readonly EventHandler[]): IntersectSpec {
  const sets = handlers.map(
    (handler) =>
      new Set(
        handler.parameter.fields
          .map((field) => field.name)
          .filter((name) => (MARGIN_SLOTS as readonly string[]).includes(name)),
      ),
  );
  const declared = [...(sets[0] ?? new Set<string>())] as MarginSlot[];
  for (const set of sets) {
    if (set.size !== declared.length || declared.some((slot) => !set.has(slot))) {
      throw new Error(
        "on-intersect handlers disagree on the margin set; every handler must declare the same block-start/block-end/inline-start/inline-end fields",
      );
    }
  }

  const slots: Record<MarginSlot, string> = {
    "block-start": "0px",
    "block-end": "0px",
    "inline-start": "0px",
    "inline-end": "0px",
  };
  for (const slot of declared) {
    let configured: string | undefined;
    for (const handler of handlers) {
      for (const field of handler.parameter.fields) {
        if (field.name !== slot) continue;
        if (field.kind !== "literal") continue;
        if (typeof field.value === "boolean") {
          throw new Error(`invalid root margin "${field.value}": rootMargin accepts only px or %`);
        }
        const value = normaliseRootMargin(field.value);
        if (configured !== undefined && configured !== value) {
          throw new Error(
            `on-intersect handlers disagree on "${slot}": "${configured}" and "${value}"`,
          );
        }
        configured = value;
      }
    }
    slots[slot] = configured ?? "0px";
  }

  const margin = MARGIN_SLOTS.map((slot) => slots[slot]).join(" ");
  return { margin, slots, declared };
}

const MARGIN_REF = /^(-?)#([\w-]+)\.(height|width)$/;

const THRESHOLDS: readonly number[] = Array.from({ length: 101 }, (_, index) => index / 100);

interface ResolvedSpec {
  rootMargin: string;
  referenced: readonly Element[];
  values: Readonly<Record<string, string>>;
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
  values: Readonly<Record<string, string>>;
}

const observersByElement = new WeakMap<Element, ManagedObserver>();

export function syncIntersect(el: Element): void {
  if (typeof IntersectionObserver === "undefined") return;
  const desired = resolveSpec(el);
  const existing = observersByElement.get(el);
  if (desired === null) {
    teardownIntersect(el);
    return;
  }
  if (existing !== undefined && existing.resolvedRootMargin === desired.rootMargin) {
    existing.values = desired.values;
    return;
  }
  teardownIntersect(el);
  const state: IntersectState = existing?.state ?? { wasOverlapping: false, wasFull: false };
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
        const values: Record<string, string> = { ...desired.values };
        if (!entered && !left && !fullChanged) continue;
        if (entered) values["state"] = "enter";
        else if (left) values["state"] = "leave";
        if (fullChanged) values["full"] = isFull ? "true" : "false";
        el.dispatchEvent(new ImplementationEvent("intersect", { values }));
      }
    },
    { rootMargin: desired.rootMargin, threshold: [...THRESHOLDS] },
  );
  observer.observe(el);
  const refListeners = desired.referenced.map((ref) => {
    const listener = (): void => syncIntersect(el);
    registerResizeListener(ref, el, listener);
    return { ref, listener };
  });
  observersByElement.set(el, {
    observer,
    resolvedRootMargin: desired.rootMargin,
    refListeners,
    state,
    values: desired.values,
  });
}

export function teardownIntersect(el: Element): void {
  const managed = observersByElement.get(el);
  if (managed === undefined) return;
  managed.observer.disconnect();
  for (const { ref, listener } of managed.refListeners) {
    unregisterResizeListener(ref, el, listener);
  }
  observersByElement.delete(el);
}

function resolveSpec(el: Element): ResolvedSpec | null {
  const value = el.getAttribute("on-intersect");
  if (value === null) return null;
  const { handlers, errors } = parseEventValueWithErrors(value);
  if (errors.length > 0) return null;
  for (const handler of handlers) {
    for (const field of handler.parameter.fields) {
      if (field.name === "state" || field.name === "full") continue;
      if ((MARGIN_SLOTS as readonly string[]).includes(field.name)) continue;
      return null;
    }
  }
  let spec: IntersectSpec;
  try {
    spec = readIntersectSpec(handlers);
  } catch {
    return null;
  }
  const { writingMode, direction } = readWritingMode(el);
  const resolvedSlots: Record<MarginSlot, string> = {
    "block-start": "0px",
    "block-end": "0px",
    "inline-start": "0px",
    "inline-end": "0px",
  };
  const referenced: Element[] = [];
  for (const slot of spec.declared) {
    const resolved = resolveMarginToken(spec.slots[slot]);
    if (resolved === null) {
      logOnce(el, `margin "${spec.slots[slot]}" references an id that is not in the document`);
      return null;
    }
    resolvedSlots[slot] = resolved.resolved;
    if (resolved.ref !== undefined && !referenced.includes(resolved.ref)) referenced.push(resolved.ref);
  }
  const physical = mapToPhysical(resolvedSlots, writingMode, direction);
  const values: Record<string, string> = {};
  for (const slot of spec.declared) values[slot] = resolvedSlots[slot];
  return { rootMargin: physical.join(" "), referenced, values };
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
  if (writingMode === "vertical-lr") {
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
