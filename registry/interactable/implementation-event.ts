export interface ImplementationEventInit {
  originalEvent?: Event;
  key?: string;
}

export class ImplementationEvent extends Event {
  readonly originalEvent: Event | undefined;
  readonly key: string | undefined;

  constructor(type: string, init: ImplementationEventInit = {}) {
    super(type, { bubbles: false, cancelable: false });
    this.originalEvent = init.originalEvent;
    this.key = init.key;
  }
}