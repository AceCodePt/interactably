import "./dom-standins.ts";
import * as interactably from "interactably";

export interface EventInfo {
  readonly fields: ReadonlyMap<string, string>;
  readonly open: boolean;
}

export interface ImplementationInfo {
  readonly name: string;
  readonly tags: readonly string[] | undefined;
  readonly verbs: ReadonlyMap<string, string>;
  readonly configAttributes: ReadonlyMap<string, string>;
  readonly stateAttributes: ReadonlyMap<string, string>;
  readonly events: readonly string[];
  readonly eventInfo: ReadonlyMap<string, EventInfo>;
}

export interface Vocabulary {
  readonly byName: ReadonlyMap<string, ImplementationInfo>;
  readonly names: readonly string[];
  readonly eventOwners: ReadonlyMap<string, string>;
}

interface RawEventSpec {
  readonly fields?: Record<string, unknown>;
  readonly open?: boolean;
}

interface RawImplementationDef {
  readonly name: string;
  readonly tags?: readonly string[];
  readonly config?: Record<string, unknown>;
  readonly state?: Record<string, unknown>;
  readonly verbs: Record<string, unknown>;
  readonly events?: Record<string, unknown>;
  readonly factory: unknown;
}

function isImplementationDef(value: unknown): value is RawImplementationDef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["name"] === "string" &&
    typeof candidate["verbs"] === "object" &&
    candidate["verbs"] !== null &&
    typeof candidate["factory"] === "function"
  );
}

function formatSignature(signature: unknown): string {
  if (typeof signature === "string") return signature;
  if (typeof signature === "function") return signature.name !== "" ? signature.name : "Element";
  if (typeof signature === "object" && signature !== null) {
    const symbols = Object.getOwnPropertySymbols(signature);
    if (symbols.length > 0) {
      const inner = (signature as Record<symbol, unknown>)[symbols[0]!];
      if (typeof inner === "object" && inner !== null && "slot" in inner) {
        return formatSignature((inner as { slot: unknown }).slot);
      }
      return formatSignature(inner);
    }
    const fields = Object.entries(signature as Record<string, unknown>).map(
      ([key, slot]) => `${key}: ${formatSignature(slot)}`,
    );
    return fields.length > 0 ? `{ ${fields.join(", ")} }` : "{}";
  }
  return String(signature);
}

function attributeKeys(name: string, keys: Record<string, unknown> | undefined): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [key, signature] of Object.entries(keys ?? {})) {
    attributes.set(`${name}-${key}`, formatSignature(signature));
  }
  return attributes;
}

function eventSpecs(events: Record<string, unknown> | undefined): Map<string, EventInfo> {
  const specs = new Map<string, EventInfo>();
  for (const [name, raw] of Object.entries(events ?? {})) {
    const spec = (typeof raw === "object" && raw !== null ? raw : {}) as RawEventSpec;
    const fields = new Map<string, string>();
    for (const [field, signature] of Object.entries(spec.fields ?? {})) {
      fields.set(field, formatSignature(signature));
    }
    specs.set(name, { fields, open: spec.open === true });
  }
  return specs;
}

export function loadVocabulary(): Vocabulary {
  const byName = new Map<string, ImplementationInfo>();
  const eventOwners = new Map<string, string>();
  for (const value of Object.values(interactably as unknown as Record<string, unknown>)) {
    if (!isImplementationDef(value)) continue;
    const verbs = new Map<string, string>();
    for (const [verb, signature] of Object.entries(value.verbs)) {
      verbs.set(verb, formatSignature(signature));
    }
    const info: ImplementationInfo = {
      name: value.name,
      tags: value.tags,
      verbs,
      configAttributes: attributeKeys(value.name, value.config),
      stateAttributes: attributeKeys(value.name, value.state),
      events: Object.keys(value.events ?? {}).sort(),
      eventInfo: eventSpecs(value.events),
    };
    byName.set(value.name, info);
    for (const event of info.events) eventOwners.set(event, value.name);
  }
  const names = [...byName.keys()].sort();
  return { byName, names, eventOwners };
}
