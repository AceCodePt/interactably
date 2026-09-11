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