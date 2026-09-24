import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { bindEvents } from "@behaviors/implementation-utils.ts";
import { parseEventAttribute } from "@interactable/parser.ts";

const DERIVABLE = new Set(["submit", "click", "keydown"]);

export function derivedDefaults(el: HTMLElement): string {
  const claimed: string[] = [];
  for (const name of el.getAttributeNames()) {
    if (!name.startsWith("on-")) continue;
    let type: string;
    let declaration: ReturnType<typeof parseEventAttribute>["declaration"];
    try {
      ({ type, declaration } = parseEventAttribute(name.slice(3)));
    } catch {
      continue;
    }
    if (!DERIVABLE.has(type)) continue;
    if (type !== "keydown") {
      claimed.push(type);
      continue;
    }
    for (const value of declaration ?? []) {
      if (value.kind !== "literal") continue;
      if (value.name === "code") claimed.push(`keydown:code:${value.literal}`);
      else if (value.name === "key") claimed.push(`keydown:${value.literal}`);
    }
  }
  if (claimed.length > 0) return claimed.join(",");
  if (el instanceof HTMLFormElement) return "submit";
  if (el instanceof HTMLAnchorElement && el.href !== "") return "click";
  if (el instanceof HTMLButtonElement) return "click";
  return "";
}

export const preventDefault = defineImplementation(
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
      connectedCallback: () => bound.update(),
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