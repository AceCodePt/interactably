import { matchesKey } from "@interactable/keys.ts";

export interface ImplementationInstance {
  // Runs once the document is parsed; #id references resolve.
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;
  [key: `on${string}`]: (e: Event) => void;
}

export class NotReadyError extends Error {
  constructor(implementsValue: string | null, verb: string) {
    super(`implements "${implementsValue ?? ""}" still loading; ${verb}() dropped`);
    this.name = "NotReadyError";
  }
}

export function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function readValue(el: Element): number | string {
  const stored = el.getAttribute("formattable-value");
  const value = (el as unknown as { value?: unknown }).value;
  const text = stored !== null ? stored : typeof value === "string" ? value : el.textContent ?? "";
  if (text.trim() === "") return text;
  const parsed = toNumber(text);
  return Number.isNaN(parsed) ? text : parsed;
}

export function valueOf(el: Element): number {
  const parsed = toNumber(readValue(el));
  return Number.isNaN(parsed) ? 0 : parsed;
}

const formatters = new WeakMap<Element, (raw: string) => string>();

export function registerFormatter(el: Element, formatter: (raw: string) => string): void {
  formatters.set(el, formatter);
}

export function formatWrite(el: Element, text: string): string {
  const formatter = formatters.get(el);
  if (formatter === undefined) return text;
  el.setAttribute("formattable-value", text);
  return formatter(text);
}

export function writeValue(el: HTMLElement, value: string): void {
  if ("value" in el) {
    el.value = value;
  } else {
    el.textContent = value;
  }
}

export interface BindEventsOptions {
  passive?: boolean;
}

export interface BoundEvents {
  update(): void;
  dispose(): void;
}

interface BoundListener {
  type: string;
  key: string | undefined;
  listener: (e: Event) => void;
}

export function bindEvents(
  el: Element,
  events: () => string,
  handler: (e: Event) => void,
  options: BindEventsOptions = {},
): BoundEvents {
  const listeners = new Map<string, BoundListener>();

  const bind = (): void => {
    const entries = parseEventList(events());
    const seen = new Set<string>();
    for (const entry of entries) {
      const id = `${entry.type}\u0000${entry.key ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const listener = (e: Event): void => {
        if (entry.key !== undefined) {
          const keyboard = e as KeyboardEvent;
          if (typeof keyboard.key !== "string" || !matchesKey(keyboard, entry.key)) return;
        }
        handler(e);
      };
      el.addEventListener(entry.type, listener, { passive: options.passive ?? true });
      listeners.set(id, { type: entry.type, key: entry.key, listener });
    }
  };

  const unbind = (): void => {
    for (const { type, listener } of listeners.values()) el.removeEventListener(type, listener);
    listeners.clear();
  };

  bind();
  return { update: () => { unbind(); bind(); }, dispose: unbind };
}

function parseEventList(list: string): Array<{ type: string; key?: string }> {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const colon = entry.indexOf(":");
      if (colon === -1) return { type: entry };
      return { type: entry.slice(0, colon).trim(), key: entry.slice(colon + 1).trim() };
    });
}