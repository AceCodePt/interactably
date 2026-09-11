export { dispatchInteraction } from "../interactable/dispatch.ts";

export function fire(el: Element, type: string, init?: EventInit): void {
  el.dispatchEvent(new Event(type, init));
}