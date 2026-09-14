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
  const id = (el as HTMLElement).id;
  return id !== "" ? `${el.localName}#${id}` : el.localName;
}