import "./dom-standins.ts";
import * as interactably from "interactably";

export interface ImplementationInfo {
  readonly name: string;
  readonly tags: readonly string[] | undefined;
  readonly verbs: ReadonlyMap<string, string>;
  readonly events: readonly string[];
}

export interface Vocabulary {
  readonly byName: ReadonlyMap<string, ImplementationInfo>;
  readonly names: readonly string[];
}

interface RawImplementationDef {
  readonly name: string;
  readonly tags?: readonly string[];
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

export function loadVocabulary(): Vocabulary {
  const byName = new Map<string, ImplementationInfo>();
  for (const value of Object.values(interactably as unknown as Record<string, unknown>)) {
    if (!isImplementationDef(value)) continue;
    const verbs = new Map<string, string>();
    for (const [verb, signature] of Object.entries(value.verbs)) {
      verbs.set(verb, formatSignature(signature));
    }
    const events = Object.keys(value.events ?? {}).sort();
    byName.set(value.name, {
      name: value.name,
      tags: value.tags,
      verbs,
      events,
    });
  }
  const names = [...byName.keys()].sort();
  return { byName, names };
}
