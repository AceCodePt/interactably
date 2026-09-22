// Once per element per message; keyed on the exact message.
// Standalone WeakMap so neither executor nor intersect owns the state.
// clearLogs runs from clearPhraseState, so detach re-arms the logger.
// intersect warnings re-arm on detach by design; that copy was never cleared before.
const loggedByElement = new WeakMap<Element, Set<string>>();

export function logOnce(el: Element, message: string): void {
  let set = loggedByElement.get(el);
  if (set === undefined) {
    set = new Set();
    loggedByElement.set(el, set);
  }
  if (set.has(message)) return;
  set.add(message);
  console.error(`[Interactable] ${message}`);
}

export function clearLogs(el: Element): void {
  loggedByElement.delete(el);
}