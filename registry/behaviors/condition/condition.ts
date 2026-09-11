import { defineImplementation } from "../_implementation-definition.ts";
import { InteractionEvent } from "../../interactable/interaction-event.ts";

type Op = "==" | "!=" | ">" | "<" | ">=" | "<=";

export const condition = defineImplementation("condition", {
  config: {
    watch: "string | undefined",
    on: "string | undefined",
    op: "'==' | '!=' | '>' | '<' | '>=' | '<=' | undefined",
    value: "string | undefined",
    verb: "string | undefined",
    target: "string | undefined",
  },
  verbs: {},
}, (el, attrs) => {
  let observer: MutationObserver | null = null;
  let watched: HTMLElement | null = null;
  let onValueChange: (() => void) | null = null;

  const check = (): void => {
    const watch = attrs.watch;
    const name = attrs.on;
    const op = attrs.op;
    const expected = attrs.value;
    const verb = attrs.verb;
    const targetId = attrs.target;
    if (watch === undefined || name === undefined || op === undefined || expected === undefined) return;
    if (verb === undefined || targetId === undefined) return;

    const source = document.getElementById(watch);
    const receiver = document.getElementById(targetId);
    if (source === null || receiver === null) return;

    const actual =
      name === "value" && "value" in source
        ? String((source as { value: unknown }).value)
        : source.getAttribute(name);
    if (actual === null) return;

    if (compare(actual, expected, op)) {
      receiver.dispatchEvent(
        new InteractionEvent({ verb, arg: undefined, source: el, originalEvent: new Event("condition") }),
      );
    }
  };

  const observe = (): void => {
    const watch = attrs.watch;
    const name = attrs.on;
    if (watch === undefined || name === undefined) return;
    watched = document.getElementById(watch);
    if (watched === null) return;
    if (name === "value" && isFormControl(watched)) {
      onValueChange = check;
      watched.addEventListener("input", onValueChange);
      watched.addEventListener("change", onValueChange);
      return;
    }
    observer = new MutationObserver(check);
    observer.observe(watched, { attributes: true, attributeFilter: [name] });
  };

  return {
    connectedCallback: () => {
      observe();
      check();
    },
    disconnectedCallback: () => {
      observer?.disconnect();
      observer = null;
      if (onValueChange !== null && watched !== null) {
        watched.removeEventListener("input", onValueChange);
        watched.removeEventListener("change", onValueChange);
      }
      onValueChange = null;
      watched = null;
    },
  };
});

function isFormControl(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function compare(actual: string, expected: string, op: Op): boolean {
  switch (op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return numeric(actual) > numeric(expected);
    case "<":
      return numeric(actual) < numeric(expected);
    case ">=":
      return numeric(actual) >= numeric(expected);
    case "<=":
      return numeric(actual) <= numeric(expected);
  }
}

function numeric(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const direct = Number(trimmed);
  if (!Number.isNaN(direct)) return direct;
  const stripped = trimmed.replace(/[^\d.\-]/g, "");
  const parsed = Number.parseFloat(stripped);
  return Number.isNaN(parsed) ? 0 : parsed;
}