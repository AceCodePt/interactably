import { defineImplementation } from "@behaviors/_implementation-definition.ts";

type Strategy =
  | { kind: "details" }
  | { kind: "dialog" }
  | { kind: "popover" }
  | { kind: "data-open" };

export const revealable = defineImplementation("revealable", {
  config: { modal: "boolean | undefined" },
  state: { open: "boolean | undefined" },
  verbs: { show: "undefined", hide: "undefined", toggle: "undefined" },
}, (el, attrs) => {
  const strategy = strategyOf(el);
  const isOpen = (): boolean => {
    switch (strategy.kind) {
      case "details":
      case "dialog":
        return (el as HTMLDetailsElement | HTMLDialogElement).open;
      case "popover":
        return el.matches(":popover-open");
      case "data-open":
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
      case "data-open":
        attrs.open = value ? true : undefined;
    }
  };
  const render = (): void => {
    if (strategy.kind === "data-open") el.hidden = !(attrs.open === true);
  };
  return {
    show: (e) => {
      setOpen(true);
      syncAria(el, e.source, isOpen());
    },
    hide: (e) => {
      setOpen(false);
      syncAria(el, e.source, isOpen());
    },
    toggle: (e) => {
      setOpen(!isOpen());
      syncAria(el, e.source, isOpen());
    },
    connectedCallback: render,
    attributeChangedCallback: (name: string): void => {
      if (name === "data-open") render();
    },
  };
});

function strategyOf(el: HTMLElement): Strategy {
  if (el instanceof HTMLDetailsElement) return { kind: "details" };
  if (el instanceof HTMLDialogElement) return { kind: "dialog" };
  if (el.hasAttribute("popover")) return { kind: "popover" };
  return { kind: "data-open" };
}

function syncAria(el: HTMLElement, source: Element, open: boolean): void {
  if (el.id === "") return;
  if (source instanceof HTMLElement && source !== el && controlsOf(source).length === 0) {
    source.setAttribute("aria-controls", el.id);
  }
  for (const controller of document.querySelectorAll("[aria-controls]")) {
    if (controlsOf(controller).includes(el.id)) {
      controller.setAttribute("aria-expanded", String(open));
    }
  }
}

function controlsOf(el: Element): string[] {
  return (el.getAttribute("aria-controls") ?? "").split(/\s+/).filter((token) => token !== "");
}