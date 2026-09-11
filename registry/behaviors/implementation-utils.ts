import { matchesKey } from "../interactable/keys.ts";

export interface ImplementationInstance {
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

export function valueOf(el: Element): number {
  const value = (el as unknown as { value?: unknown }).value;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const data = (el as unknown as { dataset?: { value?: string } }).dataset?.value;
  if (data !== undefined && data !== "") {
    const parsed = Number(data);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const parsed = Number((el.textContent ?? "").trim());
  return Number.isNaN(parsed) ? 0 : parsed;
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