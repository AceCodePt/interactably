import { isAttached } from "@interactable/attachment.ts";
import { InteractionEvent } from "@interactable/interaction-event.ts";
import { describeElement } from "@interactable/describe-element.ts";

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
  if (!isAttached(el)) {
    const id = (el as { id?: unknown }).id;
    const subject = typeof id === "string" && id !== "" ? `#${id}` : el.localName;
    throw new Error(
      `${subject} is not attached: it has no implements or on-* attribute, or start() has not run`,
    );
  }
  const event = new InteractionEvent({
    verb,
    arg,
    source: options.source ?? el,
    originalEvent: options.originalEvent ?? new Event("interaction"),
  });
  el.dispatchEvent(event);
  if (!event.handled) {
    const implementsValue = el.getAttribute("implements");
    const implementsSuffix =
      implementsValue !== null && implementsValue !== "" ? ` implements="${implementsValue}"` : "";
    throw new Error(`no implementation on <${describeElement(el)}${implementsSuffix}> handles ${verb}()`);
  }
  if (event.error !== undefined) throw event.error;
  return event.result;
}