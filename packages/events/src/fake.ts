import type { Event } from './event.js';

export class EventFake {
  public dispatched: Event[] = [];

  recordDispatch(event: Event): void {
    this.dispatched.push(event);
  }
}
