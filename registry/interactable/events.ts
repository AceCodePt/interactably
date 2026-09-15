import { getImplementationDef } from "@behaviors/implementation-registry.ts";

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
  for (const name of (el.getAttribute("implements") ?? "").split(/\s+/)) {
    if (name === "") continue;
    const def = getImplementationDef(name);
    if (def?.events.includes(type)) return true;
  }
  return false;
}