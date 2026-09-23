export const SWAP_SLOT =
  "'innerHTML' | 'outerHTML' | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' | 'delete' | 'none' | undefined";

export type SwapMode =
  | "innerHTML"
  | "outerHTML"
  | "beforebegin"
  | "afterbegin"
  | "beforeend"
  | "afterend"
  | "delete"
  | "none";

export function resolveTarget(el: Element, target: string | undefined): Element | null {
  if (target === undefined) return el;
  return document.querySelector(target);
}