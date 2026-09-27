import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import type { ImplementationEventInit } from "@interactable/implementation-event.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import { parseEventAttribute } from "@interactable/parser.ts";
import { compileSignature, scalarOr } from "@interactable/signature.ts";
import { logOnce } from "@interactable/log.ts";

interface TypeInfo {
  validate(value: unknown): unknown;
  optional: boolean;
}

const typeInfoCache = new Map<string, TypeInfo>();

function typeInfo(type: string): TypeInfo {
  const cached = typeInfoCache.get(type);
  if (cached !== undefined) return cached;
  const compiled = compileSignature(type);
  let optional = false;
  try {
    compiled.validate(undefined);
    optional = true;
  } catch {}
  const info: TypeInfo = { validate: (value) => compiled.validate(value), optional };
  typeInfoCache.set(type, info);
  return info;
}

interface ShapeEntry {
  name: string;
  type: string;
  required: boolean;
}

interface Shape {
  entries: ShapeEntry[];
  names: ReadonlySet<string>;
  required: ReadonlySet<string>;
}

function readShapes(el: Element): Shape[] {
  const shapes: Shape[] = [];
  for (const attribute of el.getAttributeNames()) {
    if (!attribute.startsWith("on-")) continue;
    let parsed: ReturnType<typeof parseEventAttribute>;
    try {
      parsed = parseEventAttribute(attribute.slice(3));
    } catch {
      continue;
    }
    if (parsed.type !== "restore" || parsed.declaration === undefined) continue;
    if (parsed.declaration.some((value) => value.kind === "literal")) continue;
    const entries: ShapeEntry[] = [];
    let valid = true;
    for (const value of parsed.declaration) {
      if (value.kind !== "type") continue;
      try {
        entries.push({ name: value.name, type: value.type, required: !typeInfo(value.type).optional });
      } catch {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    shapes.push({
      entries,
      names: new Set(entries.map((entry) => entry.name)),
      required: new Set(entries.filter((entry) => entry.required).map((entry) => entry.name)),
    });
  }
  return shapes;
}

function subset(inner: ReadonlySet<string>, outer: ReadonlySet<string>): boolean {
  for (const value of inner) if (!outer.has(value)) return false;
  return true;
}

function ambiguous(a: Shape, b: Shape): boolean {
  return subset(a.required, b.names) && subset(b.required, a.names);
}

function warnAmbiguous(el: Element, shapes: Shape[]): void {
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!;
      const b = shapes[j]!;
      if (!ambiguous(a, b)) continue;
      const left = [...a.names].sort().join(", ");
      const right = [...b.names].sort().join(", ");
      logOnce(
        el,
        `storable: on-restore handlers (${left}) and (${right}) can both match one stored object; ` +
          `a widened handler replaces the narrower one`,
      );
      return;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(shape: Shape, object: Record<string, unknown>): boolean {
  for (const key of Object.keys(object)) {
    if (!shape.names.has(key)) return false;
  }
  for (const entry of shape.entries) {
    if (!Object.prototype.hasOwnProperty.call(object, entry.name)) {
      if (entry.required) return false;
      continue;
    }
    try {
      typeInfo(entry.type).validate(object[entry.name]);
    } catch {
      return false;
    }
  }
  return true;
}

function isQuota(err: unknown): boolean {
  if (typeof DOMException === "undefined" || !(err instanceof DOMException)) return false;
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

class ElementValue {
  static [Symbol.hasInstance](value: unknown): boolean {
    const ctor = (globalThis as unknown as { Element?: new () => Element }).Element;
    return typeof ctor === "function" && value instanceof ctor;
  }
}

Object.defineProperty(ElementValue, "name", { value: "Element" });

const ElementSlot = ElementValue as unknown as { new (): Element; prototype: Element };

function toJson(value: unknown): unknown {
  if (value instanceof ElementValue) return (value as Element).innerHTML;
  return value;
}

export const storable = defineImplementation(
  "storable",
  {
    config: {
      id: "string",
    },
    verbs: {
      save: { "*": scalarOr(ElementSlot) },
      restore: "undefined",
      clear: "undefined",
    },
    events: {
      restore: { open: true },
      "save-error": { fields: { reason: "'quota' | 'denied' | 'serialize'" }, open: true },
      "restore-error": { fields: { reason: "'parse'" }, open: true },
    },
  },
  (el, attrs) => {
    const id = attrs.id;

    const storage = (): Storage | null => (typeof localStorage === "undefined" ? null : localStorage);

    const dispatch = (e: InteractionEvent, type: string, values?: Record<string, string>): void => {
      if (!el.isConnected) return;
      const init: ImplementationEventInit = { originalEvent: e.originalEvent };
      if (values !== undefined) init.values = values;
      el.dispatchEvent(new ImplementationEvent(type, init));
    };

    const read = (): string | null => {
      try {
        return storage()?.getItem(id) ?? null;
      } catch {
        return null;
      }
    };

    const remove = (): void => {
      try {
        storage()?.removeItem(id);
      } catch {
        return;
      }
    };

    return {
      save: (e, fields): void => {
        const object: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(fields ?? {})) object[name] = toJson(value);
        let serialized: string;
        try {
          serialized = JSON.stringify(object);
        } catch {
          dispatch(e, "save-error", { reason: "serialize" });
          return;
        }
        const store = storage();
        if (store === null) {
          dispatch(e, "save-error", { reason: "denied" });
          return;
        }
        try {
          store.setItem(id, serialized);
        } catch (err) {
          dispatch(e, "save-error", { reason: isQuota(err) ? "quota" : "denied" });
        }
      },
      restore: (e): void => {
        const stored = read();
        if (stored === null) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(stored);
        } catch {
          dispatch(e, "restore-error", { reason: "parse" });
          return;
        }
        if (!isRecord(parsed)) {
          dispatch(e, "restore-error", { reason: "parse" });
          return;
        }
        const shapes = readShapes(el);
        warnAmbiguous(el, shapes);
        if (!shapes.some((shape) => matches(shape, parsed))) return;
        const values: Record<string, string> = {};
        for (const key of Object.keys(parsed)) values[key] = String(parsed[key]);
        dispatch(e, "restore", values);
      },
      clear: (): void => {
        remove();
      },
    };
  },
);
