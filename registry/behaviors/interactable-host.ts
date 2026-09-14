import { defineAutoWebComponent } from "auto-wc";
import type { Constructor } from "auto-wc";
import { LEGACY_EVENTS_WITHOUT_IDL } from "@interactable/events.ts";
import { clearPhraseState, runPhrases } from "@interactable/executor.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import { NotReadyError } from "@behaviors/implementation-utils.ts";
import type { ImplementationInstance } from "@behaviors/implementation-utils.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";
import {
  REGISTRY_CHANGED_EVENT,
  allObservedAttributes,
  ensureImplementation,
  getImplementationDef,
} from "@behaviors/implementation-registry.ts";

export interface InteractableHost extends HTMLElement {
  didEnsure: boolean;
}

interface HostElementBase {
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;
}

export function defineInteractableHost(tag: Tag): void {
  const hostName = `interactable-${tag}`;
  if (customElements.get(hostName)) return;
  const observed = allObservedAttributes();
  const HostFactory = ((Base: Constructor<HTMLElement & HostElementBase>) => {
    class InteractableHostElement extends Base {
      didEnsure = false;
      _implementations = new Map<string, ImplementationInstance>();
      _interactionCleanup: Array<() => void> = [];
      _attributeObserver: MutationObserver | null = null;

      override connectedCallback(): void {
        super.connectedCallback?.();
        this.wireTriggers();
        this.wireAttributeObserver();
        this.ensureImplementations();
        this.ownerDocument.addEventListener(REGISTRY_CHANGED_EVENT, this.onRegistryChanged);
      }

      override disconnectedCallback(): void {
        this.ownerDocument.removeEventListener(REGISTRY_CHANGED_EVENT, this.onRegistryChanged);
        this._attributeObserver?.disconnect();
        this._attributeObserver = null;
        for (const cleanup of this._interactionCleanup) cleanup();
        this._interactionCleanup = [];
        for (const implementation of this._implementations.values()) {
          implementation.disconnectedCallback?.();
        }
        clearPhraseState(this as unknown as Element);
        super.disconnectedCallback?.();
      }

      override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        for (const implementation of this._implementations.values()) {
          implementation.attributeChangedCallback?.(name, oldValue, newValue);
        }
        super.attributeChangedCallback?.(name, oldValue, newValue);
      }

      private wireAttributeObserver(): void {
        const filter = allObservedAttributes();
        if (filter.length === 0) return;
        const Observer = this.ownerDocument.defaultView?.MutationObserver;
        if (Observer === undefined) return;
        const native = (this.constructor as { observedAttributes?: readonly string[] }).observedAttributes ?? [];
        const observer = new Observer((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type !== "attributes") continue;
            const name = mutation.attributeName;
            if (name === null) continue;
            if (native.includes(name)) continue;
            const oldValue = mutation.oldValue;
            const newValue = this.getAttribute(name);
            for (const implementation of this._implementations.values()) {
              implementation.attributeChangedCallback?.(name, oldValue, newValue);
            }
          }
        });
        observer.observe(this, { attributes: true, attributeFilter: filter, attributeOldValue: true });
        this._attributeObserver = observer;
      }

      private refreshAttributeObserver(): void {
        if (this._attributeObserver === null) return;
        const filter = allObservedAttributes();
        if (filter.length === 0) return;
        this._attributeObserver.observe(this, { attributes: true, attributeFilter: filter, attributeOldValue: true });
      }

      onInteraction(event: InteractionEvent): void {
        if (!this.didEnsure) {
          event.handled = true;
          event.error = new NotReadyError(this.getAttribute("implements"), event.verb);
          return;
        }
        for (const [name, implementation] of this._implementations) {
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

      private wireTriggers(): void {
        for (const attribute of this.getAttributeNames()) {
          if (!attribute.startsWith("on-")) continue;
          const type = attribute.slice(3);
          const handler = (ev: Event): void => {
            runPhrases(this, this.getAttribute(attribute) ?? "", ev);
          };
          this.addEventListener(type, handler, { passive: true });
          if (!(("on" + type) in this) && !LEGACY_EVENTS_WITHOUT_IDL.has(type)) {
            console.warn(
              `[Interactable] on-${type} on ${describeElement(this)}: <${this.localName}> has no "${type}" ` +
                `event; custom events are fine, but check the spelling and case`,
            );
          }
          warnIfNativeActionLikelyUnwanted(this, type);
          this._interactionCleanup.push(() => this.removeEventListener(type, handler));
        }
      }

      private onRegistryChanged = (): void => {
        this.ensureImplementations();
      };

      private ensureImplementations(): void {
        const names = (this.getAttribute("implements") ?? "").split(/\s+/).filter((name) => name !== "");
        for (const name of names) {
          if (this._implementations.has(name)) continue;
          const def = getImplementationDef(name);
          if (def === undefined) {
            console.error(`[Interactable] implements "${name}": no such implementation is registered`);
            continue;
          }
          if (def.tags !== undefined && !def.tags.includes(this.localName as Tag)) {
            const tags = def.tags.map((t) => `<${t}>`).join(", ");
            console.error(`[Interactable] ${name} attaches to ${tags}; skipped on ${describeElement(this)}`);
            continue;
          }
          try {
            const implementation = ensureImplementation(this, name, def);
            this._implementations.set(name, implementation);
            implementation.connectedCallback?.();
            this.wireImplementationHandlers(implementation);
          } catch (err) {
            console.error(`[Interactable] ${name} failed to attach on ${describeElement(this)}`, err);
          }
        }
        this.didEnsure = true;
        this.refreshAttributeObserver();
      }

      private wireImplementationHandlers(implementation: ImplementationInstance): void {
        for (const key of Object.keys(implementation)) {
          if (!/^on[A-Z]/.test(key)) continue;
          const method = (implementation as unknown as Record<string, unknown>)[key];
          if (typeof method !== "function") continue;
          const type = key.slice(2).toLowerCase();
          const handler = (method as (e: Event) => void).bind(implementation);
          this.addEventListener(type, handler);
          this._interactionCleanup.push(() => this.removeEventListener(type, handler));
        }
      }
    }
    return InteractableHostElement as unknown as Constructor<HTMLElement> & { observedAttributes?: string[] };
  }) as unknown as Parameters<typeof defineAutoWebComponent>[2];
  defineAutoWebComponent(hostName, tag, HostFactory, { observedAttributes: observed });
}

function describeElement(el: Element): string {
  const id = (el as HTMLElement).id;
  return id !== "" ? `${el.localName}#${id}` : el.localName;
}

function warnIfNativeActionLikelyUnwanted(el: HTMLElement, type: string): void {
  const implementsValue = el.getAttribute("implements") ?? "";
  if (implementsValue.split(/\s+/).includes("prevent-default")) return;
  if (el instanceof HTMLFormElement && type === "submit") {
    console.warn(`[Interactable] on-submit on ${describeElement(el)}: <form> also submits natively; add implements="prevent-default" to cancel it`);
  } else if (el instanceof HTMLAnchorElement && el.href && type === "click") {
    console.warn(`[Interactable] on-click on ${describeElement(el)}: <a href> also navigates; add implements="prevent-default" to cancel it`);
  } else if (el instanceof HTMLButtonElement && (type === "keydown" || type === "keyup")) {
    console.warn(`[Interactable] on-${type} on ${describeElement(el)}: <button> also activates on Enter/Space; add implements="prevent-default" to cancel it`);
  }
}