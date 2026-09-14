import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { bindEvents } from "@behaviors/implementation-utils.ts";
import { parse } from "@interactable/parser.ts";

const DERIVABLE = new Set(["submit", "click", "keydown"]);

export function derivedDefaults(el: HTMLElement): string {
  const claimed: string[] = [];
  for (const name of el.getAttributeNames()) {
    if (!name.startsWith("on-") || !DERIVABLE.has(name.slice(3))) continue;
    const type = name.slice(3);
    if (type !== "keydown") {
      claimed.push(type);
      continue;
    }
    for (const phrase of parse(el.getAttribute(name) ?? "")) {
      if (phrase.key !== undefined) claimed.push(`keydown:${phrase.key}`);
    }
  }
  if (claimed.length > 0) return claimed.join(",");
  if (el instanceof HTMLFormElement) return "submit";
  if (el instanceof HTMLAnchorElement && el.href !== "") return "click";
  if (el instanceof HTMLButtonElement) return "click";
  return "";
}

export const preventDefault = defineImplementation<undefined, { events: "string | undefined" }, {}, {}>(
  "prevent-default",
  {
    config: { events: "string | undefined" },
    verbs: {},
  },
  (el, attrs) => {
    const derived = derivedDefaults(el);
    const events = (): string => attrs.events ?? derived;
    if (events() === "") {
      console.warn(
        `[Interactable] prevent-default on ${describe(el)}: no events derived; ` +
          `add prevent-default-events="…" to name them`,
      );
    }
    const bound = bindEvents(el, events, (e) => e.preventDefault(), { passive: false });
    return {
      attributeChangedCallback: (name: string): void => {
        if (name === "prevent-default-events") bound.update();
      },
      disconnectedCallback: () => bound.dispose(),
    };
  },
);

function describe(el: HTMLElement): string {
  return el.id !== "" ? `${el.localName}#${el.id}` : el.localName;
}