export { defineImplementation } from "../registry/behaviors/_implementation-definition.ts";
export { defineInteractableHost } from "../registry/behaviors/interactable-host.ts";
export {
  registerImplementation,
  getImplementationDef,
} from "../registry/behaviors/implementation-registry.ts";
export { runPhrases, clearPhraseState } from "../registry/interactable/executor.ts";
export { dispatchInteraction } from "../registry/interactable/dispatch.ts";
export { InteractionEvent } from "../registry/interactable/interaction-event.ts";
export { noPropagate } from "../registry/behaviors/no-propagate/no-propagate.ts";
export { preventDefault } from "../registry/behaviors/prevent-default/prevent-default.ts";
export { revealable } from "../registry/behaviors/revealable/revealable.ts";