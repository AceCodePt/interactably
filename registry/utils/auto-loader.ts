import { defineInteractableHost } from "@behaviors/interactable-host.ts";
import type { Tag } from "@behaviors/_implementation-definition.ts";

// The auto-loader is a prototyping convenience, not a production dependency.
// It watches for elements carrying `implements` or any `on-*` attribute and
// upgrades them to `is="interactable-<tag>"` by replacing the node. The
// replacement runs a microtask after insertion (MutationObserver timing) and
// drops focus; any JS reference captured before the swap points at a detached
// node. Prefer explicit `is=` in templates and server output (§7).

let infoLogged = false;

export function installAutoLoader(): () => void {
  const seen = new WeakSet<HTMLElement>();

  const upgrade = (el: HTMLElement): void => {
    if (seen.has(el)) return;
    seen.add(el);
    try {
      upgradeElement(el);
    } catch (err) {
      console.error("[Interactable] auto-loader failed to upgrade", el, err);
    }
  };

  const scanNode = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    upgrade(el);
    for (const child of el.querySelectorAll<HTMLElement>("*")) upgrade(child);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) scanNode(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    if (el.hasAttribute("implements") || el.getAttributeNames().some((name) => name.startsWith("on-"))) {
      upgrade(el);
    }
  }

  return () => observer.disconnect();
}

function upgradeElement(el: HTMLElement): void {
  if (el.hasAttribute("is")) return;
  const needsHost = el.hasAttribute("implements") || el.getAttributeNames().some((name) => name.startsWith("on-"));
  if (!needsHost) return;
  const tag = el.localName as Tag;
  const hostName = `interactable-${tag}`;
  if (customElements.get(hostName) === undefined) defineInteractableHost(tag);
  const replacement = document.createElement(tag, { is: hostName });
  replacement.setAttribute("is", hostName);
  for (const name of el.getAttributeNames()) {
    const value = el.getAttribute(name);
    if (value !== null) replacement.setAttribute(name, value);
  }
  while (el.firstChild !== null) replacement.appendChild(el.firstChild);
  el.replaceWith(replacement);
  if (!infoLogged) {
    infoLogged = true;
    console.info(
      "[Interactable] auto-loader upgraded an element; upgrades run a microtask after insertion and drop focus - " +
        "prefer explicit is= in templates and server output",
    );
  }
}