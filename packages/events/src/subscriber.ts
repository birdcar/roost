import type { EventClass } from './types.js';
import type { Event } from './event.js';

export abstract class Subscriber {
  abstract subscribe(): Map<EventClass<Event>, string>;
}
