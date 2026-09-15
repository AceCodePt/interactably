import { getImplementationDef } from "@behaviors/implementation-registry.ts";
import { INTERSECT_EVENT_NAMES } from "@interactable/intersect.ts";

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

export function isImplementationEvent(el: Element, type: string): boolean {
  if (INTERSECT_EVENT_NAMES.has(type)) return true;
  for (const name of (el.getAttribute("implements") ?? "").split(/\s+/)) {
    if (name === "") continue;
    const def = getImplementationDef(name);
    if (def?.events.includes(type)) return true;
  }
  return false;
}