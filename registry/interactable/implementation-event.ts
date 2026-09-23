export interface ImplementationEventInit {
  originalEvent?: Event;
  key?: string;
  values?: Record<string, string>;
}

export class ImplementationEvent extends Event {
  readonly originalEvent: Event | undefined;
  readonly key: string | undefined;
  readonly values: Readonly<Record<string, string>>;

  constructor(type: string, init: ImplementationEventInit = {}) {
    super(type, { bubbles: false, cancelable: false });
    this.originalEvent = init.originalEvent;
    this.key = init.key;
    this.values = init.values ?? {};
  }
}