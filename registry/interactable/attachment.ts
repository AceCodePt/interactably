import { describeElement } from "@interactable/describe-element.ts";
import { LEGACY_EVENTS_WITHOUT_IDL, getEventSpec, isImplementationEvent } from "@interactable/events.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { readIntersectSpec, syncIntersect, teardownIntersect } from "@interactable/intersect.ts";
import { clearPhraseState, runEventValue } from "@interactable/executor.ts";
import { ANCHOR } from "@utils/formula.ts";
import { isBareNumber, isNumberLiteral, parseEventValueWithErrors } from "@interactable/parser.ts";
import type { Arg, EventHandler } from "@interactable/parser.ts";
import { compileSignature } from "@interactable/signature.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";
import {
  ensureImplementation,
  getImplementationDef,
  implementationOwningEvent,
  presentImplementationNames,
  track,
  untrack,
} from "@behaviors/implementation-registry.ts";

export interface Attachment {
  implementations: Map<string, ImplementationInstance>;
  implCleanup: Map<string, Array<() => void>>;
  triggers: Map<string, () => void>;
  attributeObserver: MutationObserver | null;
}

const attachmentByElement = new WeakMap<Element, Attachment>();
const startedRoots = new Set<Element | Document>();
const reportedLegacy = new WeakSet<Element>();

export function getAttachment(el: Element): Attachment | undefined {
  return attachmentByElement.get(el);
}

export function isAttached(el: Element): boolean {
  return attachmentByElement.has(el);
}

export function markStartedRoot(root: Element | Document): void {
  startedRoots.add(root);
}

export function unmarkStartedRoot(root: Element | Document): void {
  startedRoots.delete(root);
}

export function attach(el: Element): void {
  if (attachmentByElement.has(el)) return;
  const attachment: Attachment = {
    implementations: new Map(),
    implCleanup: new Map(),
    triggers: new Map(),
    attributeObserver: null,
  };
  attachmentByElement.set(el, attachment);
  reportLegacyImplements(el);
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

export function attachCarrying(attribute: string): void {
  const batch: Element[] = [];
  const seen = new Set<Element>();
  for (const root of startedRoots) {
    if (root.nodeType === 9) {
      const body = (root as Document).body;
      if (body === null) continue;
      if (body.hasAttribute(attribute) && !seen.has(body)) {
        seen.add(body);
        batch.push(body);
      }
      for (const el of body.querySelectorAll(`[${attribute}]`)) {
        if (seen.has(el)) continue;
        seen.add(el);
        batch.push(el);
      }
    } else {
      for (const el of (root as Element).querySelectorAll(`[${attribute}]`)) {
        if (seen.has(el)) continue;
        seen.add(el);
        batch.push(el);
      }
    }
  }
  batch.sort(byDocumentOrder);
  for (const el of batch) {
    if (!el.isConnected || isAttached(el)) continue;
    attach(el);
    fireOnLoad(el);
  }
}

function byDocumentOrder(a: Element, b: Element): number {
  if (a === b) return 0;
  return (a.compareDocumentPosition(b) & 4) !== 0 ? -1 : 1;
}

export function ensureAttachment(el: Element): void {
  const attachment = attachmentByElement.get(el);
  if (attachment === undefined) return;
  ensureImplementations(el, attachment);
}

export function fireOnLoad(el: Element): void {
  const value = el.getAttribute("on-load");
  if (value === null) return;
  runEventValue(el, value, new ImplementationEvent("load"));
}

function ensureImplementations(el: Element, attachment: Attachment): void {
  const present = presentImplementationNames(el);
  for (const name of [...attachment.implementations.keys()]) {
    if (!present.includes(name)) removeImplementation(attachment, name);
  }
  for (const name of present) {
    if (attachment.implementations.has(name)) continue;
    const def = getImplementationDef(name);
    if (def === undefined) continue;
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

export const REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE = "implements";

export function reportLegacyImplements(el: Element): void {
  if (!el.hasAttribute(REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE) || reportedLegacy.has(el)) return;
  reportedLegacy.add(el);
  const value = (el.getAttribute(REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE) ?? "").split(/\s+/).filter((name) => name !== "");
  const replacement = value.length === 0 ? "no implementation attributes" : value.join(" ");
  console.error(
    `[Interactable] on ${describeElement(el)}: the implements attribute is no longer supported; ` +
      `name each implementation as its own attribute (here: ${replacement})`,
  );
}

function onInteraction(raw: Event): void {
  const el = raw.target as Element | null;
  if (el === null) return;
  const attachment = attachmentByElement.get(el);
  if (attachment === undefined) return;
  const event = raw as InteractionEvent;
  for (const name of presentImplementationNames(el)) {
    const implementation = attachment.implementations.get(name);
    if (implementation === undefined) continue;
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
  if (attribute.includes("(")) {
    console.error(
      `[Interactable] on ${describeElement(el)}, "${attribute}": value declarations no longer belong in the attribute name; ` +
        `write ${attribute.slice(0, attribute.indexOf("("))}="({ name: type }) => { … }"`,
    );
    return;
  }
  const type = attribute.slice(3);
  if (type === "") {
    console.error(`[Interactable] on ${describeElement(el)}, "${attribute}": missing event type`);
    return;
  }
  const value = el.getAttribute(attribute) ?? "";
  const { handlers, errors } = parseEventValueWithErrors(value);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(
        `[Interactable] on ${describeElement(el)}, "${attribute}": ${error.message}`,
      );
    }
    return;
  }
  if (!validateHandlers(el, attribute, type, handlers)) return;
  if (type === "intersect") {
    try {
      readIntersectSpec(handlers);
    } catch (err) {
      console.error(
        `[Interactable] on ${describeElement(el)}, "${attribute}": ${(err as Error).message}`,
      );
      return;
    }
  }
  const owner = implementationOwningEvent(type);
  if (owner !== undefined && !el.hasAttribute(owner.name) && !isNativeEventType(el, type)) {
    console.error(
      `[Interactable] on ${describeElement(el)}, "${attribute}": "${type}" is an event of "${owner.name}"; ` +
        `add the ${owner.name} attribute to receive it`,
    );
    return;
  }
  const handler = (ev: Event): void => {
    if (!(ev instanceof ImplementationEvent) && isImplementationEvent(el, type)) return;
    runEventValue(el, el.getAttribute(attribute) ?? "", ev);
  };
  el.addEventListener(type, handler, { passive: true });
  attachment.triggers.set(attribute, () => el.removeEventListener(type, handler));
  if (!isImplementationEvent(el, type)) {
    if (!isNativeEventType(el, type)) {
      console.warn(
        `[Interactable] on-${type} on ${describeElement(el)}: has no "${type}" ` +
          `event; custom events are fine, but check the spelling and case`,
      );
    }
    warnIfNativeActionLikelyUnwanted(el as HTMLElement, type, attribute);
  }
}

function isNativeEventType(el: Element, type: string): boolean {
  return ("on" + type) in el || LEGACY_EVENTS_WITHOUT_IDL.has(type);
}

function validateHandlers(
  el: Element,
  attribute: string,
  type: string,
  handlers: readonly EventHandler[],
): boolean {
  const spec = getEventSpec(el, type);
  const closed = spec !== undefined && spec.open !== true;
  for (const handler of handlers) {
    const declared = new Set<string>();
    const bound = new Set<string>();
    for (const field of handler.parameter.fields) {
      if (declared.has(field.name)) {
        console.error(
          `[Interactable] on ${describeElement(el)}, "${attribute}": "${field.name}" is declared twice in one handler`,
        );
        return false;
      }
      declared.add(field.name);
      const fieldType = closed ? spec.fields?.[field.name] : undefined;
      if (closed && fieldType === undefined) {
        console.error(
          `[Interactable] on ${describeElement(el)}, "${attribute}": "${field.name}" is not a field of event "${type}"`,
        );
        return false;
      }
      if (field.kind === "literal") {
        if (fieldType !== undefined && !literalFits(fieldType, field.value)) {
          console.error(
            `[Interactable] on ${describeElement(el)}, "${attribute}": ${describeLiteral(field.value)} does not match ` +
              `"${field.name}", declared ${fieldType}`,
          );
          return false;
        }
        continue;
      }
      try {
        compileSignature(field.type);
      } catch (err) {
        console.error(
          `[Interactable] on ${describeElement(el)}, "${attribute}": "${field.type}" is not a valid value type for "${field.name}" ` +
            `(${(err as Error).message})`,
        );
        return false;
      }
      if (fieldType !== undefined && !typesOverlap(fieldType, field.type)) {
        console.error(
          `[Interactable] on ${describeElement(el)}, "${attribute}": "${field.type}" does not overlap ` +
            `"${field.name}", declared ${fieldType}`,
        );
        return false;
      }
      bound.add(field.name);
    }
    for (const phrase of handler.phrases) {
      for (const unit of phrase.units) {
        for (const call of unit.calls) {
          for (const name of namesInArg(call.arg)) {
            if (bound.has(name)) continue;
            console.error(
              `[Interactable] on ${describeElement(el)}, "${attribute}": "${name}" is not bound by this handler; ` +
                `declare it in the parameter, e.g. ({ ${name}: string })`,
            );
            return false;
          }
        }
      }
    }
  }
  return true;
}

function describeLiteral(literal: string | number | boolean): string {
  return typeof literal === "string" ? `'${literal}'` : String(literal);
}

function literalFits(fieldType: string, literal: string | number | boolean): boolean {
  const parts = fieldType.split("|").map((part) => part.trim());
  const numericUnion = parts.every(isNumberLiteral);
  if (numericUnion) return typeof literal === "number" && parts.includes(String(literal));
  if (isBareNumber(fieldType)) return typeof literal === "number";
  const stringUnion = parts.every((part) => STRING_UNION.test(part));
  if (stringUnion) return typeof literal === "string" && parts.some((part) => unquote(part) === literal);
  if (fieldType.trim() === "string") return typeof literal === "string";
  if (fieldType.trim() === "boolean") return typeof literal === "boolean";
  if (parts.includes("number") && typeof literal === "number") return true;
  if (parts.includes("string") && typeof literal === "string") return true;
  if (parts.includes("boolean") && typeof literal === "boolean") return true;
  return typeof literal === "string";
}

const STRING_UNION = /^'[^']*'$/;

function unquote(part: string): string {
  return part.slice(1, -1);
}

function typeKinds(type: string): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const raw of type.split("|")) {
    const part = raw.trim();
    if (part === "string") kinds.add("string");
    else if (part === "number") kinds.add("number");
    else if (part === "boolean") kinds.add("boolean");
    else if (NUMBER_CONTROL.test(part)) kinds.add("number");
    else if (STRING_UNION.test(part)) kinds.add("string");
    else if (part === "true" || part === "false") kinds.add("boolean");
  }
  return kinds;
}

const NUMBER_CONTROL = /^-?\d+(?:\.\d+)?$/;

function typesOverlap(fieldType: string, declaredType: string): boolean {
  const fieldKinds = typeKinds(fieldType);
  const declaredKinds = typeKinds(declaredType);
  if (fieldKinds.size === 0 || declaredKinds.size === 0) return true;
  for (const kind of declaredKinds) if (fieldKinds.has(kind)) return true;
  return false;
}

function namesInArg(arg: Arg | undefined): string[] {
  if (arg === undefined) return [];
  switch (arg.kind) {
    case "name":
      return [arg.name];
    case "object":
      return arg.fields.flatMap((field) => namesInArg(field.value));
    default:
      return [];
  }
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
      if (name === ANCHOR) continue;
      const oldValue = mutation.oldValue;
      const newValue = el.getAttribute(name);
      if (name === REMOVED_IMPLEMENTATION_LIST_ATTRIBUTE) {
        reportLegacyImplements(el);
      } else if (getImplementationDef(name) !== undefined) {
        ensureImplementations(el, attachment);
      } else if (name.startsWith("on-")) {
        if (name === "on-intersect") syncIntersect(el);
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

function warnIfNativeActionLikelyUnwanted(el: HTMLElement, type: string, attribute: string): void {
  if (el.hasAttribute("prevent-default")) return;
  if (el instanceof HTMLFormElement && type === "submit") {
    console.warn(`[Interactable] on-submit on ${describeElement(el)}: also submits natively; add the prevent-default attribute to cancel it`);
  } else if (el instanceof HTMLAnchorElement && el.href && type === "click") {
    console.warn(`[Interactable] on-click on ${describeElement(el)}: also navigates; add the prevent-default attribute to cancel it`);
  } else if (el instanceof HTMLButtonElement && (type === "keydown" || type === "keyup")) {
    if (!hasKeyLiteral(el, attribute)) {
      console.warn(`[Interactable] on-${type} on ${describeElement(el)}: also activates on Enter/Space; add the prevent-default attribute to cancel it`);
    }
  }
}

function hasKeyLiteral(el: Element, attribute: string): boolean {
  const { handlers } = parseEventValueWithErrors(el.getAttribute(attribute) ?? "");
  return handlers.some((handler) =>
    handler.parameter.fields.some(
      (field) => field.kind === "literal" && (field.name === "key" || field.name === "code"),
    ),
  );
}