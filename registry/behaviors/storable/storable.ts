import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";
import type { ReadProperty, Ref } from "@interactable/parser.ts";
import { parseRefOrRead } from "@interactable/parser.ts";

type Slot =
  | { kind: "literal"; text: string }
  | { kind: "ref"; ref: Ref }
  | { kind: "read"; ref: Ref; property: ReadProperty };

function parseSlot(raw: string): Slot {
  const refOrRead = parseRefOrRead(raw);
  if (refOrRead === undefined) return { kind: "literal", text: raw };
  if (refOrRead.kind === "ref") return { kind: "ref", ref: refOrRead.ref };
  return { kind: "read", ref: refOrRead.ref, property: refOrRead.property };
}

export const storable = defineImplementation(
  "storable",
  {
    config: {
      scope: "'local' | 'session' | undefined",
      key: "string",
      value: "string",
    },
    verbs: {
      save: "undefined",
      restore: "undefined",
      clear: "undefined",
    },
    events: { restore: { open: true } },
  },
  (el, attrs) => {
    const key = attrs.key;
    const slot = parseSlot(attrs.value);

    const storage = (): Storage | null => {
      const store = attrs.scope === "session" ? sessionStorage : localStorage;
      return typeof store === "undefined" ? null : store;
    };

    const read = (key: string): string | null => {
      try {
        return storage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    };

    const write = (key: string, value: string): void => {
      try {
        storage()?.setItem(key, value);
      } catch {
        return;
      }
    };

    const remove = (key: string): void => {
      try {
        storage()?.removeItem(key);
      } catch {
        return;
      }
    };

    const resolve = (ref: Ref): Element => {
      if (ref.kind === "this") return el;
      const target = typeof document === "undefined" ? null : document.getElementById(ref.id);
      if (target === null) throw new Error(`storable: #${ref.id} not found`);
      return target;
    };

    const readSlot = (): string => {
      if (slot.kind === "literal") return slot.text;
      const target = resolve(slot.ref);
      if (slot.kind === "ref") return target.innerHTML;
      return String((target as unknown as Record<string, unknown>)[slot.property] ?? "");
    };

    return {
      save: (): void => {
        write(key, slot.kind === "literal" ? slot.text : readSlot());
      },
      restore: (e: InteractionEvent): void => {
        const stored = read(key);
        if (stored === null) return;
        el.dispatchEvent(
          new ImplementationEvent("restore", {
            originalEvent: e.originalEvent,
            values: { value: stored },
          }),
        );
      },
      clear: (): void => {
        remove(key);
      },
    };
  },
);