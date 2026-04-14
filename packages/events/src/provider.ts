import { ServiceProvider } from '@roost/core';
import { EventDispatcher } from './dispatcher.js';
import type { EventClass, ListenerClass, SubscriberClass } from './types.js';
import type { Event } from './event.js';
import { Subscriber } from './subscriber.js';

export abstract class EventServiceProvider extends ServiceProvider {
  protected listen(): Map<EventClass<Event>, ListenerClass[]> {
    return new Map();
  }

  protected subscribers(): SubscriberClass[] {
    return [];
  }

  register(): void {
    const dispatcher = new EventDispatcher();

    for (const [eventClass, listenerClasses] of this.listen()) {
      for (const listenerClass of listenerClasses) {
        dispatcher.registerListener(eventClass, listenerClass);
      }
    }

    for (const SubscriberCls of this.subscribers()) {
      const subscriber = new SubscriberCls();
      for (const [eventClass, methodName] of subscriber.subscribe()) {
        const method = (subscriber as unknown as Record<string, unknown>)[methodName];
        if (typeof method !== 'function') {
          throw new Error(
            `Subscriber method "${methodName}" not found on ${SubscriberCls.name}`
          );
        }
        const boundMethod = (method as (e: Event) => void | Promise<void>).bind(subscriber);
        // Wrap in a real constructor so `new ListenerCls()` works in EventDispatcher
        function SubscriberListenerWrapper() {}
        SubscriberListenerWrapper.prototype.handle = (e: Event) => boundMethod(e);
        Object.defineProperty(SubscriberListenerWrapper, 'name', {
          value: `${SubscriberCls.name}@${methodName}`,
        });
        dispatcher.registerListener(eventClass, SubscriberListenerWrapper as unknown as ListenerClass);
      }
    }

    EventDispatcher.set(dispatcher);
    this.app.container.singleton('events.dispatcher', () => dispatcher);
  }
}
