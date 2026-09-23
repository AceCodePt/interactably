import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { exclusive, optionalCtor } from "@interactable/signature.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import { resolveTarget, SWAP_SLOT } from "@behaviors/swap.ts";
import type { SwapMode } from "@behaviors/swap.ts";

const PLACEHOLDER = /\{([A-Za-z_$][A-Za-z0-9_$]*)\}/g;

type Undo =
  | { kind: "inserted"; nodes: ChildNode[] }
  | { kind: "children"; target: Element; before: ChildNode[] }
  | { kind: "replaced"; parent: Node; reference: Node | null; inserted: ChildNode[]; original: Element };

export const renderable = defineImplementation(
  "renderable",
  {
    config: {
      "disable-view-transition": "boolean | undefined",
    },
    verbs: {
      render: {
        template: optionalCtor(HTMLTemplateElement),
        payload: exclusive("template", "string | undefined"),
        swap: SWAP_SLOT,
        target: "string | undefined",
        "*": "string | number | boolean",
      },
      undo: "undefined",
    },
    events: ["rendered"],
  },
  (el, attrs) => {
    let last: Undo | undefined;
    const announce = (): void => {
      el.dispatchEvent(new ImplementationEvent("rendered"));
    };
    return {
      render: (_e, opts) => {
        const options = opts ?? {};
        const swap: SwapMode = options.swap ?? "innerHTML";
        const destination = resolveTarget(el, options.target);
        if (destination === null) {
          throw new Error(`renderable: target "${options.target ?? ""}" not found`);
        }
        if (swap === "none") {
          last = undefined;
          return;
        }
        const { template, payload, swap: _swap, target: _target, ...slots } = options;
        let mutate: () => void;
        if (swap === "delete") {
          const parent = destination.parentNode;
          if (parent === null) throw new Error("renderable: cannot delete a detached element");
          const reference = destination.nextSibling;
          mutate = () => {
            destination.remove();
            last = { kind: "replaced", parent, reference, inserted: [], original: destination };
          };
        } else {
          let fragment: DocumentFragment;
          if (payload !== undefined) {
            fragment = fragmentFromMarkup(payload);
          } else {
            if (!(template instanceof HTMLTemplateElement)) {
              throw new Error(`renderable: template is required for swap "${swap}"`);
            }
            fragment = stamp(template, slots);
          }
          assertUniqueIds(fragment);
          const nodes = Array.from(fragment.childNodes);
          mutate = () => {
            switch (swap) {
              case "innerHTML": {
                const before = Array.from(destination.childNodes);
                destination.replaceChildren(fragment);
                last = { kind: "children", target: destination, before };
                return;
              }
              case "outerHTML": {
                const parent = destination.parentNode;
                if (parent === null) throw new Error("renderable: cannot replace a detached element");
                const reference = destination.nextSibling;
                destination.replaceWith(fragment);
                last = { kind: "replaced", parent, reference, inserted: nodes, original: destination };
                return;
              }
              case "beforebegin":
                destination.before(fragment);
                last = { kind: "inserted", nodes };
                return;
              case "afterbegin":
                destination.prepend(fragment);
                last = { kind: "inserted", nodes };
                return;
              case "beforeend":
                destination.append(fragment);
                last = { kind: "inserted", nodes };
                return;
              case "afterend":
                destination.after(fragment);
                last = { kind: "inserted", nodes };
                return;
            }
          };
        }
        const canTransition =
          attrs["disable-view-transition"] !== true &&
          typeof document !== "undefined" &&
          typeof document.startViewTransition === "function";
        if (canTransition) {
          document.startViewTransition(mutate).finished.then(announce);
        } else {
          mutate();
          announce();
        }
      },
      undo: () => {
        const record = last;
        last = undefined;
        if (record === undefined) return;
        if (record.kind === "inserted") {
          for (const node of record.nodes) node.remove();
        } else if (record.kind === "children") {
          record.target.replaceChildren(...record.before);
        } else {
          for (const node of record.inserted) node.remove();
          const reference =
            record.reference !== null && record.reference.parentNode === record.parent
              ? record.reference
              : null;
          record.parent.insertBefore(record.original, reference);
        }
      },
    };
  },
);

function stamp(
  template: HTMLTemplateElement,
  slots: Record<string, string | number | boolean>,
): DocumentFragment {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const placeholders = collectPlaceholders(fragment);
  for (const name of Object.keys(slots)) {
    if (!placeholders.has(name)) {
      throw new Error(`renderable: slot "${name}" is not declared in the template`);
    }
  }
  for (const name of placeholders) {
    if (!(name in slots)) {
      throw new Error(`renderable: slot "{${name}}" has no value`);
    }
  }
  substitute(fragment, slots);
  return fragment;
}

function fragmentFromMarkup(markup: string): DocumentFragment {
  const holder = document.createElement("template");
  holder.innerHTML = markup;
  return holder.content;
}

function collectPlaceholders(fragment: DocumentFragment): Set<string> {
  const names = new Set<string>();
  for (const node of descendants(fragment)) {
    if (node.nodeType === 3) {
      for (const match of (node.nodeValue ?? "").matchAll(PLACEHOLDER)) names.add(match[1]!);
    } else if (node.nodeType === 1) {
      for (const name of (node as Element).getAttributeNames()) {
        for (const match of ((node as Element).getAttribute(name) ?? "").matchAll(PLACEHOLDER)) {
          names.add(match[1]!);
        }
      }
    }
  }
  return names;
}

function substitute(
  fragment: DocumentFragment,
  slots: Record<string, string | number | boolean>,
): void {
  for (const node of descendants(fragment)) {
    if (node.nodeType === 3) {
      node.nodeValue = fill(node.nodeValue ?? "", slots);
    } else if (node.nodeType === 1) {
      const element = node as Element;
      for (const name of element.getAttributeNames()) {
        const value = element.getAttribute(name) ?? "";
        element.setAttribute(name, fill(value, slots));
      }
    }
  }
}

function fill(text: string, slots: Record<string, string | number | boolean>): string {
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = slots[name];
    if (value === undefined) return match;
    return String(value);
  });
}

function assertUniqueIds(fragment: DocumentFragment): void {
  const seen = new Set<string>();
  for (const node of descendants(fragment)) {
    if (node.nodeType !== 1) continue;
    const id = (node as Element).id;
    if (id === "") continue;
    if (seen.has(id) || document.getElementById(id) !== null) {
      throw new Error(`renderable: duplicate id "${id}"; nothing was inserted`);
    }
    seen.add(id);
  }
}

function* descendants(root: Node): Generator<Node> {
  for (const child of root.childNodes) {
    yield child;
    yield* descendants(child);
  }
}