import type { Event } from './event.js';
import type { Subscriber } from './subscriber.js';

export type EventClass<T extends Event = Event> = {
  new (...args: unknown[]): T;
  dispatch(event: T): Promise<void>;
  fake(): void;
  restore(): void;
};

export type ListenerClass = {
  new (): { handle(event: unknown): void | Promise<void> };
  name: string;
};

export type SubscriberClass = {
  new (): Subscriber;
};

export type ListenerMap = Map<EventClass<Event>, ListenerClass[]>;
