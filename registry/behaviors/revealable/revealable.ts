import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { parse } from "@interactable/parser.ts";
import type { Call } from "@interactable/parser.ts";

type Strategy =
  | { kind: "details" }
  | { kind: "dialog" }
  | { kind: "popover" }
  | { kind: "attribute" };

export const revealable = defineImplementation("revealable", {
  config: { modal: "boolean | undefined" },
  state: { open: "boolean | undefined" },
  verbs: { show: "boolean | undefined", toggle: "undefined" },
}, (el, attrs) => {
  const strategy = strategyOf(el);
  const isOpen = (): boolean => {
    switch (strategy.kind) {
      case "details":
      case "dialog":
        return (el as HTMLDetailsElement | HTMLDialogElement).open;
      case "popover":
        return el.matches(":popover-open");
      case "attribute":
        return attrs.open === true;
    }
  };
  const setOpen = (value: boolean): void => {
    switch (strategy.kind) {
      case "details":
        (el as HTMLDetailsElement).open = value;
        return;
      case "dialog": {
        const dialog = el as HTMLDialogElement;
        if (value) {
          if (!dialog.open) (attrs.modal === false ? dialog.show() : dialog.showModal());
        } else {
          dialog.close();
        }
        return;
      }
      case "popover":
        if (value) {
          if (!isOpen()) el.showPopover();
        } else if (isOpen()) {
          el.hidePopover();
        }
        return;
      case "attribute":
        attrs.open = value ? true : undefined;
    }
  };
  const render = (): void => {
    if (strategy.kind === "attribute") el.hidden = !(attrs.open === true);
  };
  return {
    show: (e, value) => {
      const resolved = value ?? true;
      setOpen(resolved);
      syncAria(el, e.source, isOpen(), resolved);
    },
    toggle: (e) => {
      setOpen(!isOpen());
      syncAria(el, e.source, isOpen(), true);
    },
    connectedCallback: (): void => {
      render();
      if (el.id !== "") wireControllers(el, isOpen());
    },
    attributeChangedCallback: (name: string): void => {
      if (name === "revealable-open") render();
    },
  };
});

function strategyOf(el: HTMLElement): Strategy {
  if (el instanceof HTMLDetailsElement) return { kind: "details" };
  if (el instanceof HTMLDialogElement) return { kind: "dialog" };
  if (el.hasAttribute("popover")) return { kind: "popover" };
  return { kind: "attribute" };
}

function syncAria(el: HTMLElement, source: Element | undefined, open: boolean, control: boolean): void {
  if (el.id === "") return;
  if (control && source instanceof HTMLElement && source !== el && controlsOf(source).length === 0) {
    source.setAttribute("aria-controls", el.id);
  }
  for (const controller of document.querySelectorAll("[aria-controls]")) {
    if (controlsOf(controller).includes(el.id) && canBeExpanded(controller)) {
      controller.setAttribute("aria-expanded", String(open));
    }
  }
}

function wireControllers(el: HTMLElement, open: boolean): void {
  for (const host of document.querySelectorAll<HTMLElement>('[is^="interactable-"]')) {
    if (host === el) continue;
    if (!controlledPanelIds(host).has(el.id)) continue;
    const tokens = controlsOf(host);
    if (!tokens.includes(el.id)) {
      tokens.push(el.id);
      host.setAttribute("aria-controls", tokens.join(" "));
    }
    if (canBeExpanded(host)) host.setAttribute("aria-expanded", String(open));
  }
}

function controlledPanelIds(host: Element): Set<string> {
  const ids = new Set<string>();
  for (const name of host.getAttributeNames()) {
    if (!name.startsWith("on-")) continue;
    const value = host.getAttribute(name) ?? "";
    const phrases = parse(value, name.slice(3));
    for (const phrase of phrases) {
      for (const unit of phrase.units) {
        if (unit.ref.kind !== "id") continue;
        if (unit.calls.some(isControllingCall)) ids.add(unit.ref.id);
      }
    }
  }
  return ids;
}

function isControllingCall(call: Call): boolean {
  if (call.verb === "toggle") return true;
  if (call.verb !== "show") return false;
  const arg = call.arg;
  if (arg === undefined) return true;
  return arg.kind === "boolean" && arg.value === true;
}

function canBeExpanded(el: Element): boolean {
  return !(el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox"));
}

function controlsOf(el: Element): string[] {
  return (el.getAttribute("aria-controls") ?? "").split(/\s+/).filter((token) => token !== "");
}