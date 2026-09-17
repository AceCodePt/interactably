export const MEASURED: unique symbol = Symbol("interactable.measured");

export interface Measured {
  width: number;
  height: number;
}

type ResizeListener = () => void;

const listenersByRef = new WeakMap<Element, Set<ResizeListener>>();
const referrersByRef = new WeakMap<Element, Set<Element>>();
let observer: ResizeObserver | null = null;

function ensureObserver(): ResizeObserver | null {
  if (observer !== null) return observer;
  if (typeof ResizeObserver === "undefined") return null;
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target;
      const border = entry.borderBoxSize?.[0];
      let measured: Measured;
      if (border !== undefined) {
        measured = { width: border.inlineSize, height: border.blockSize };
      } else {
        const rect = entry.contentRect;
        const style = getComputedStyle(target);
        measured = {
          width: rect.width + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth),
          height: rect.height + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
        };
      }
      store(target, measured);
      const listeners = listenersByRef.get(target);
      if (listeners !== undefined) {
        for (const listener of listeners) listener();
      }
    }
  });
  return observer;
}

function store(el: Element, measured: Measured): void {
  (el as unknown as Record<PropertyKey, unknown>)[MEASURED] = measured;
}

function readCache(el: Element): Measured | undefined {
  return (el as unknown as Record<PropertyKey, unknown>)[MEASURED] as Measured | undefined;
}

export function readMeasured(el: Element, dim: "width" | "height"): number {
  const cached = readCache(el);
  if (cached !== undefined) return cached[dim];
  const rect = el.getBoundingClientRect();
  const measured: Measured = { width: rect.width, height: rect.height };
  store(el, measured);
  ensureObserver()?.observe(el);
  return measured[dim];
}

export function registerResizeListener(
  target: Element,
  referrer: Element,
  listener: ResizeListener,
): void {
  let listeners = listenersByRef.get(target);
  if (listeners === undefined) {
    listeners = new Set();
    listenersByRef.set(target, listeners);
  }
  listeners.add(listener);
  let referrers = referrersByRef.get(target);
  if (referrers === undefined) {
    referrers = new Set();
    referrersByRef.set(target, referrers);
  }
  referrers.add(referrer);
  ensureObserver()?.observe(target);
}

export function unregisterResizeListener(
  target: Element,
  referrer: Element,
  listener: ResizeListener,
): void {
  const listeners = listenersByRef.get(target);
  if (listeners !== undefined) {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByRef.delete(target);
  }
  const referrers = referrersByRef.get(target);
  if (referrers !== undefined) {
    referrers.delete(referrer);
    if (referrers.size === 0) {
      referrersByRef.delete(target);
      ensureObserver()?.unobserve(target);
    }
  }
}