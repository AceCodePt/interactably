export interface RectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface FakeResizeEntry {
  target: Element;
  borderBoxSize?: Array<{ blockSize: number; inlineSize: number }>;
  contentRect?: RectLike;
}

export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  readonly observed: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
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

  trigger(entries: FakeResizeEntry[]): void {
    const mapped = entries.map((entry) => {
      const result: Record<string, unknown> = {
        target: entry.target,
        contentRect: entry.contentRect ?? { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 },
      };
      if (entry.borderBoxSize !== undefined) result["borderBoxSize"] = entry.borderBoxSize;
      return result;
    });
    this.callback(mapped as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

export function resetFakeResizeObserver(): void {
  FakeResizeObserver.instances.length = 0;
}

export function installFakeResizeObserver(): void {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}