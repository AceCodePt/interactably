export interface InteractionEventInit {
  verb: string;
  arg: unknown;
  source: Element;
  originalEvent: Event;
}

export class InteractionEvent extends Event {
  readonly verb: string;
  readonly arg: unknown;
  readonly source: Element;
  readonly originalEvent: Event;
  handled = false;
  error?: unknown;
  result?: unknown;

  constructor(init: InteractionEventInit) {
    super("interaction", { bubbles: false, cancelable: true });
    this.verb = init.verb;
    this.arg = init.arg;
    this.source = init.source;
    this.originalEvent = init.originalEvent;
  }
}