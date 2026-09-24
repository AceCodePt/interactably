import { isDateFormat } from "@behaviors/formattable/format.ts";

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

export type ReadableProperty = "value" | "checked" | "min" | "max" | "step";

export function readValue(el: Element, property: ReadableProperty = "value"): number | string | boolean {
  if (property === "checked") return (el as unknown as { checked?: unknown }).checked === true;
  if (el instanceof HTMLInputElement && (el.type === "number" || el.type === "range")) {
    if (property === "value") {
      const raw = el.value;
      if (raw === "") return "";
      return el.valueAsNumber;
    }
    if (property === "step") {
      const raw = el.step;
      if (raw === "") return 1;
      return Number(raw);
    }
    const raw = el[property];
    if (raw === "") return "";
    return Number(raw);
  }
  if (property === "min" || property === "max" || property === "step") {
    return el.getAttribute(property) ?? "";
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked === true;
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
  const stored = el.getAttribute("formattable-value");
  const format = el.getAttribute("formattable-format");
  if (stored !== null && format !== null && !isDateFormat(format)) {
    if (stored === "") return "";
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? NaN : parsed;
  }
  return el.textContent ?? "";
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
  field: KeyField | undefined;
  value: string | undefined;
  listener: (e: Event) => void;
}

type KeyField = "key" | "code";

interface EventEntry {
  type: string;
  field?: KeyField;
  value?: string;
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
      const id = `${entry.type}\u0000${entry.field ?? ""}\u0000${entry.value ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const listener = (e: Event): void => {
        if (!matchesEventEntry(e, entry)) return;
        handler(e);
      };
      el.addEventListener(entry.type, listener, { passive: options.passive ?? true });
      listeners.set(id, { type: entry.type, field: entry.field, value: entry.value, listener });
    }
  };

  const unbind = (): void => {
    for (const { type, listener } of listeners.values()) el.removeEventListener(type, listener);
    listeners.clear();
  };

  bind();
  return { update: () => { unbind(); bind(); }, dispose: unbind };
}

function matchesEventEntry(e: Event, entry: EventEntry): boolean {
  if (entry.value === undefined) return true;
  if (entry.field === "code") {
    const code = (e as KeyboardEvent).code;
    return typeof code === "string" && code.toLowerCase() === entry.value.toLowerCase();
  }
  const key = (e as KeyboardEvent).key;
  if (typeof key !== "string") return false;
  const wanted = entry.value.toLowerCase() === "space" ? " " : entry.value;
  return key.toLowerCase() === wanted.toLowerCase();
}

function parseEventList(list: string): EventEntry[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const parts = entry.split(":");
      const type = parts[0]!.trim();
      if (parts.length === 1) return { type };
      if (parts.length === 2) return { type, field: "key", value: parts[1]!.trim() };
      const field: KeyField = parts[1]!.trim() === "code" ? "code" : "key";
      return { type, field, value: parts.slice(2).join(":").trim() };
    });
}