import { defineImplementation } from "@behaviors/_implementation-definition.ts";

interface Entry {
  link: HTMLAnchorElement;
  target: Element;
}

export const spyable = defineImplementation("spyable", {
  config: { offset: "number | undefined" },
  verbs: {},
}, (el, attrs) => {
  let frame = 0;

  const entries = (): Entry[] => {
    const found: Entry[] = [];
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const id = decodeURIComponent(link.hash.slice(1));
      if (id === "") continue;
      const target = el.ownerDocument.getElementById(id);
      if (target !== null) found.push({ link, target });
    }
    return found;
  };

  const activate = (href: string | undefined): void => {
    for (const { link } of entries()) {
      const active = link.getAttribute("href") === href;
      link.toggleAttribute("data-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  const sync = (): void => {
    const list = entries();
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) return;
    const view = el.ownerDocument.defaultView;
    const atBottom =
      view !== null &&
      el.ownerDocument.documentElement.scrollHeight > view.innerHeight &&
      view.innerHeight + view.scrollY >= el.ownerDocument.documentElement.scrollHeight - 1;
    let active = first.link;
    if (atBottom) {
      active = last.link;
    } else {
      const line = attrs.offset ?? 0;
      for (const entry of list) {
        if (entry.target.getBoundingClientRect().top <= line) active = entry.link;
      }
    }
    activate(active.getAttribute("href") ?? undefined);
  };

  const schedule = (): void => {
    const view = el.ownerDocument.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== "function") {
      sync();
      return;
    }
    if (frame !== 0) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  return {
    connectedCallback: () => {
      const view = el.ownerDocument.defaultView;
      if (view === null) return;
      view.addEventListener("scroll", schedule, { passive: true });
      view.addEventListener("resize", schedule, { passive: true });
      sync();
    },
    disconnectedCallback: () => {
      const view = el.ownerDocument.defaultView;
      if (view === null) return;
      view.removeEventListener("scroll", schedule);
      view.removeEventListener("resize", schedule);
    },
  };
});
