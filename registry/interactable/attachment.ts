import { describeElement } from "@interactable/describe-element.ts";
import { LEGACY_EVENTS_WITHOUT_IDL, isImplementationEvent } from "@interactable/events.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { INTERSECT_ATTRIBUTES, syncIntersect, teardownIntersect } from "@interactable/intersect.ts";
import { clearPhraseState, runPhrases } from "@interactable/executor.ts";
import { parse } from "@interactable/parser.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import { NotReadyError } from "@behaviors/implementation-utils.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";
import {
  ensureImplementation,
  getImplementationDef,
  track,
  untrack,
} from "@behaviors/implementation-registry.ts";

export interface Attachment {
  implementations: Map<string, ImplementationInstance>;
  implCleanup: Map<string, Array<() => void>>;
  triggers: Map<string, () => void>;
  attributeObserver: MutationObserver | null;
  pendingMissing: Set<string>;
  reportedMissing: Set<string>;
}

const attachmentByElement = new WeakMap<Element, Attachment>();

export function getAttachment(el: Element): Attachment | undefined {
  return attachmentByElement.get(el);
}

export function isAttached(el: Element): boolean {
  return attachmentByElement.has(el);
}

export function attach(el: Element): void {
  if (attachmentByElement.has(el)) return;
  const attachment: Attachment = {
    implementations: new Map(),
    implCleanup: new Map(),
    triggers: new Map(),
    attributeObserver: null,
    pendingMissing: new Set(),
    reportedMissing: new Set(),
  };
  attachmentByElement.set(el, attachment);
  wireTriggers(el, attachment);
  syncIntersect(el);
  el.addEventListener("interaction", onInteraction as EventListener);
  ensureImplementations(el, attachment);
  wireAttributeObserver(el, attachment);
  track(el);
}

export function detach(el: Element): void {
  const attachment = attachmentByElement.get(el);
  if (attachment === undefined) return;
  untrack(el);
  attachment.attributeObserver?.disconnect();
  attachment.attributeObserver = null;
  for (const cleanup of attachment.triggers.values()) cleanup();
  attachment.triggers.clear();
  for (const [name, cleanups] of attachment.implCleanup) {
    for (const cleanup of cleanups) cleanup();
    attachment.implementations.get(name)?.disconnectedCallback?.();
  }
  attachment.implCleanup.clear();
  attachment.implementations.clear();
  el.removeEventListener("interaction", onInteraction as EventListener);
  teardownIntersect(el);
  clearPhraseState(el);
  attachmentByElement.delete(el);
}

export function ensureAttachment(el: Element): void {
  const attachment = attachmentByElement.get(el);
  if (attachment === undefined) return;
  ensureImplementations(el, attachment);
}

export function fireOnLoad(el: Element): void {
  const value = el.getAttribute("on-load");
  if (value === null) return;
  runPhrases(el, value, new ImplementationEvent("load"));
}

function ensureImplementations(el: Element, attachment: Attachment): void {
  const names = (el.getAttribute("implements") ?? "").split(/\s+/).filter((name) => name !== "");
  for (const name of [...attachment.implementations.keys()]) {
    if (!names.includes(name)) removeImplementation(attachment, name);
  }
  for (const name of names) {
    if (attachment.implementations.has(name)) continue;
    const def = getImplementationDef(name);
    if (def === undefined) {
      deferMissingReport(el, attachment, name);
      continue;
    }
    if (def.tags !== undefined && !def.tags.includes(el.localName as Tag)) {
      const tags = def.tags.map((t) => `<${t}>`).join(", ");
      console.error(`[Interactable] ${name} attaches to ${tags}; skipped on ${describeElement(el)}`);
      continue;
    }
    try {
      const implementation = ensureImplementation(el, name, def);
      attachment.implementations.set(name, implementation);
      implementation.connectedCallback?.();
      wireImplementationHandlers(el, attachment, name, implementation);
    } catch (err) {
      console.error(`[Interactable] ${name} failed to attach on ${describeElement(el)}`, err);
    }
  }
}

function removeImplementation(attachment: Attachment, name: string): void {
  const implementation = attachment.implementations.get(name);
  if (implementation === undefined) return;
  const cleanups = attachment.implCleanup.get(name);
  if (cleanups !== undefined) {
    for (const cleanup of cleanups) cleanup();
    attachment.implCleanup.delete(name);
  }
  implementation.disconnectedCallback?.();
  attachment.implementations.delete(name);
}

function deferMissingReport(el: Element, attachment: Attachment, name: string): void {
  if (attachment.reportedMissing.has(name) || attachment.pendingMissing.has(name)) return;
  attachment.pendingMissing.add(name);
  setTimeout(() => {
    attachment.pendingMissing.delete(name);
    if (!el.isConnected) return;
    if (getImplementationDef(name) !== undefined) return;
    const names = (el.getAttribute("implements") ?? "").split(/\s+/);
    if (!names.includes(name)) return;
    attachment.reportedMissing.add(name);
    console.error(`[Interactable] implements "${name}": no such implementation is registered`);
  }, 0);
}

function onInteraction(raw: Event): void {
  const el = raw.target as Element | null;
  if (el === null) return;
  const attachment = attachmentByElement.get(el);
  if (attachment === undefined) return;
  const event = raw as InteractionEvent;
  const implementsValue = el.getAttribute("implements") ?? "";
  for (const name of implementsValue.split(/\s+/)) {
    if (name === "") continue;
    const implementation = attachment.implementations.get(name);
    if (implementation === undefined) {
      if (attachment.pendingMissing.has(name)) {
        event.handled = true;
        event.error = new NotReadyError(implementsValue, event.verb);
        return;
      }
      continue;
    }
    const def = getImplementationDef(name);
    const signature = def?.verbs[event.verb];
    if (signature === undefined) continue;
    event.handled = true;
    try {
      const arg = signature.validate(event.arg);
      const method = (implementation as unknown as Record<string, unknown>)[event.verb];
      if (typeof method !== "function") {
        throw new Error(`implementation "${name}" has no method for verb ${event.verb}()`);
      }
      event.result = (method as (e: InteractionEvent, arg: unknown) => unknown).call(
        implementation,
        event,
        arg,
      );
      if (typeof (event.result as { then?: unknown } | null)?.then === "function") {
        console.warn(
          `[Interactable] ${name}.${event.verb}() returned a promise; ` +
            `chains are synchronous - continue via a ${name}-* config phrase`,
        );
      }
    } catch (err) {
      event.error = err;
    }
    return;
  }
}

function wireTriggers(el: Element, attachment: Attachment): void {
  for (const attribute of el.getAttributeNames()) {
    if (!attribute.startsWith("on-")) continue;
    bindTrigger(el, attachment, attribute);
  }
}

function bindTrigger(el: Element, attachment: Attachment, attribute: string): void {
  if (attribute === "on-load") return;
  if (attachment.triggers.has(attribute)) return;
  const type = attribute.slice(3);
  const handler = (ev: Event): void => {
    if (!(ev instanceof ImplementationEvent) && isImplementationEvent(el, type)) return;
    runPhrases(el, el.getAttribute(attribute) ?? "", ev);
  };
  el.addEventListener(type, handler, { passive: true });
  if (!isImplementationEvent(el, type)) {
    if (!(("on" + type) in el) && !LEGACY_EVENTS_WITHOUT_IDL.has(type)) {
      console.warn(
        `[Interactable] on-${type} on ${describeElement(el)}: has no "${type}" ` +
          `event; custom events are fine, but check the spelling and case`,
      );
    }
    warnIfNativeActionLikelyUnwanted(el as HTMLElement, type);
  }
  attachment.triggers.set(attribute, () => el.removeEventListener(type, handler));
}

function unbindTrigger(attachment: Attachment, attribute: string): void {
  const cleanup = attachment.triggers.get(attribute);
  if (cleanup === undefined) return;
  cleanup();
  attachment.triggers.delete(attribute);
}

function wireImplementationHandlers(
  el: Element,
  attachment: Attachment,
  name: string,
  implementation: ImplementationInstance,
): void {
  const cleanups: Array<() => void> = [];
  for (const key of Object.keys(implementation)) {
    if (!/^on[A-Z]/.test(key)) continue;
    const method = (implementation as unknown as Record<string, unknown>)[key];
    if (typeof method !== "function") continue;
    const type = key.slice(2).toLowerCase();
    const handler = (method as (e: Event) => void).bind(implementation);
    el.addEventListener(type, handler);
    cleanups.push(() => el.removeEventListener(type, handler));
  }
  attachment.implCleanup.set(name, cleanups);
}

function wireAttributeObserver(el: Element, attachment: Attachment): void {
  const Observer = el.ownerDocument?.defaultView?.MutationObserver;
  if (Observer === undefined) return;
  const observer = new Observer((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "attributes") continue;
      const name = mutation.attributeName;
      if (name === null) continue;
      const oldValue = mutation.oldValue;
      const newValue = el.getAttribute(name);
      if (name === "implements") {
        ensureImplementations(el, attachment);
      } else if (INTERSECT_ATTRIBUTES.includes(name)) {
        syncIntersect(el);
        handleTriggerAttribute(el, attachment, name, oldValue, newValue);
      } else if (name.startsWith("on-")) {
        handleTriggerAttribute(el, attachment, name, oldValue, newValue);
      } else {
        for (const implementation of attachment.implementations.values()) {
          implementation.attributeChangedCallback?.(name, oldValue, newValue);
        }
      }
    }
  });
  observer.observe(el, { attributes: true, attributeOldValue: true });
  attachment.attributeObserver = observer;
}

function handleTriggerAttribute(
  el: Element,
  attachment: Attachment,
  name: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  if (name === "on-load") return;
  if (oldValue === null && newValue !== null) bindTrigger(el, attachment, name);
  else if (oldValue !== null && newValue === null) unbindTrigger(attachment, name);
}

function warnIfNativeActionLikelyUnwanted(el: HTMLElement, type: string): void {
  const implementsValue = el.getAttribute("implements") ?? "";
  if (implementsValue.split(/\s+/).includes("prevent-default")) return;
  if (el instanceof HTMLFormElement && type === "submit") {
    console.warn(`[Interactable] on-submit on ${describeElement(el)}: also submits natively; add implements="prevent-default" to cancel it`);
  } else if (el instanceof HTMLAnchorElement && el.href && type === "click") {
    console.warn(`[Interactable] on-click on ${describeElement(el)}: also navigates; add implements="prevent-default" to cancel it`);
  } else if (el instanceof HTMLButtonElement && (type === "keydown" || type === "keyup")) {
    const phrases = parse(el.getAttribute(`on-${type}`) ?? "", type);
    if (phrases.some((phrase) => phrase.key === undefined)) {
      console.warn(`[Interactable] on-${type} on ${describeElement(el)}: also activates on Enter/Space; add implements="prevent-default" to cancel it`);
    }
  }
}