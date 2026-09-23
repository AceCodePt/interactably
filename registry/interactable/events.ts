import { getImplementationDef } from "@behaviors/implementation-registry.ts";
import { INTERSECT_EVENT_NAMES } from "@interactable/intersect.ts";
import type { EventSpec } from "@behaviors/types.ts";

export const LEGACY_EVENTS_WITHOUT_IDL: ReadonlySet<string> = new Set([
  "DOMContentLoaded",
  "DOMActivate",
  "DOMAttrModified",
  "DOMCharacterDataModified",
  "DOMNodeInserted",
  "DOMNodeInsertedIntoDocument",
  "DOMNodeRemoved",
  "DOMNodeRemovedFromDocument",
  "DOMSubtreeModified",
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

export const KEYBOARD_EVENT_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  keydown: { key: "string", code: "string" },
  keyup: { key: "string", code: "string" },
};

export function isImplementationEvent(el: Element, type: string): boolean {
  if (INTERSECT_EVENT_NAMES.has(type)) return true;
  for (const name of (el.getAttribute("implements") ?? "").split(/\s+/)) {
    if (name === "") continue;
    const def = getImplementationDef(name);
    if (def !== undefined && Object.hasOwn(def.events, type)) return true;
  }
  return false;
}

function implementationEventSpec(el: Element, type: string): EventSpec | undefined {
  for (const name of (el.getAttribute("implements") ?? "").split(/\s+/)) {
    if (name === "") continue;
    const def = getImplementationDef(name);
    if (def === undefined) continue;
    const spec = def.events[type];
    if (spec !== undefined) return spec;
  }
  return undefined;
}

export function getEventSpec(el: Element, type: string): EventSpec | undefined {
  const builtin = KEYBOARD_EVENT_FIELDS[type];
  if (builtin !== undefined) return { fields: builtin };
  return implementationEventSpec(el, type);
}

export function getEventFieldTypes(
  el: Element,
  type: string,
): Readonly<Record<string, string>> | undefined {
  const spec = getEventSpec(el, type);
  if (spec === undefined || spec.open === true) return undefined;
  return spec.fields;
}