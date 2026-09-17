export interface RectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface FakeEntry {
  target: Element;
  isIntersecting?: boolean;
  intersectionRatio?: number;
  boundingClientRect?: RectLike;
  intersectionRect?: RectLike;
  rootBounds?: RectLike;
}

const DEFAULT_EL: RectLike = { top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100 };
const DEFAULT_VIEWPORT: RectLike = { top: 0, right: 800, bottom: 600, left: 0, width: 800, height: 600 };

function zeroRect(rect: RectLike): RectLike {
  return { top: rect.top, right: rect.top, bottom: rect.top, left: rect.top, width: 0, height: 0 };
}

export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: number[];
  readonly observed: Element[] = [];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "0px";
    this.thresholds =
      typeof options?.threshold === "number"
        ? [options.threshold]
        : Array.isArray(options?.threshold)
          ? options.threshold
          : [0];
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    if (!this.observed.includes(target)) this.observed.push(target);
  }

  unobserve(target: Element): void {
    const index = this.observed.indexOf(target);
    if (index !== -1) this.observed.splice(index, 1);
  }

  disconnect(): void {
    this.observed.length = 0;
  }

  trigger(entries: FakeEntry[]): void {
    const mapped = entries.map((entry) => {
      const boundingClientRect = entry.boundingClientRect ?? DEFAULT_EL;
      const rootBounds = entry.rootBounds ?? DEFAULT_VIEWPORT;
      const ratio = entry.intersectionRatio ?? (entry.isIntersecting ? 1 : 0);
      const hasIntersectionRect = entry.intersectionRect !== undefined;
      const isIntersecting =
        entry.isIntersecting ??
        (hasIntersectionRect
          ? entry.intersectionRect!.width > 0 && entry.intersectionRect!.height > 0
          : ratio > 0);
      const intersectionRect =
        entry.intersectionRect ?? (isIntersecting ? { ...boundingClientRect } : zeroRect(boundingClientRect));
      return {
        target: entry.target,
        isIntersecting,
        intersectionRatio: ratio,
        boundingClientRect,
        intersectionRect,
        rootBounds,
      };
    });
    this.callback(mapped as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

export function resetFakeIntersectionObserver(): void {
  FakeIntersectionObserver.instances.length = 0;
}

export function installFakeIntersectionObserver(): void {
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
}