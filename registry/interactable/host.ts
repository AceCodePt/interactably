export const IS_HOST: unique symbol = Symbol("interactable.is-host");

export function isHost(el: Element): boolean {
  return (el as unknown as Record<PropertyKey, unknown>)[IS_HOST] === true;
}