import { isHost } from "@interactable/host.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";

export interface DispatchInteractionOptions {
  source?: Element;
  originalEvent?: Event;
}

export function dispatchInteraction(
  el: Element,
  verb: string,
  arg?: unknown,
  options: DispatchInteractionOptions = {},
): unknown {
  if (!isHost(el)) {
    const id = (el as { id?: unknown }).id;
    const subject = typeof id === "string" && id !== "" ? `#${id}` : el.localName;
    throw new Error(`${subject} is not an interactable host; add is="interactable-${el.localName}"`);
  }
  const event = new InteractionEvent({
    verb,
    arg,
    source: options.source ?? el,
    originalEvent: options.originalEvent ?? new Event("interaction"),
  });
  el.dispatchEvent(event);
  if (!event.handled) {
    throw new Error(`no implementation on <${describe(el)}> handles ${verb}()`);
  }
  if (event.error !== undefined) throw event.error;
  return event.result;
}

function describe(el: Element): string {
  const id = (el as { id?: unknown }).id;
  const base = typeof id === "string" && id !== "" ? `${el.localName}#${id}` : el.localName;
  const implementsValue = el.getAttribute("implements");
  const implementsSuffix =
    implementsValue !== null && implementsValue !== "" ? ` implements="${implementsValue}"` : "";
  return `<${base}${implementsSuffix}>`;
}