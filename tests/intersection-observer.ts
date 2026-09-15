export interface FakeEntry {
  target: Element;
  isIntersecting?: boolean;
  intersectionRatio?: number;
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
    const mapped = entries.map((entry) => ({
      target: entry.target,
      isIntersecting: entry.isIntersecting ?? false,
      intersectionRatio: entry.intersectionRatio ?? 0,
    }));
    this.callback(mapped as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

export function resetFakeIntersectionObserver(): void {
  FakeIntersectionObserver.instances.length = 0;
}

export function installFakeIntersectionObserver(): void {
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
}