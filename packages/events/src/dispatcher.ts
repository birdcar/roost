import type { ListenerMap, EventClass, ListenerClass } from './types.js';
import type { Event } from './event.js';
import type { Listener } from './listener.js';

let instance: EventDispatcher | null = null;

export class EventDispatcher {
  private listeners: ListenerMap = new Map();

  static get(): EventDispatcher {
    if (!instance) {
      instance = new EventDispatcher();
    }
    return instance;
  }

  static set(dispatcher: EventDispatcher): void {
    instance = dispatcher;
  }

  registerListener(eventClass: EventClass<Event>, listenerClass: ListenerClass): void {
    const existing = this.listeners.get(eventClass) ?? [];
    this.listeners.set(eventClass, [...existing, listenerClass]);
  }

  async dispatch(event: Event): Promise<void> {
    const listenerClasses = this.listeners.get(event.constructor as EventClass<Event>) ?? [];

    await Promise.all(
      listenerClasses.map(async (ListenerCls) => {
        const listener = new ListenerCls() as Listener & { shouldQueue?: true };

        if ('shouldQueue' in listener && listener.shouldQueue === true) {
          // @roost/queue is a peer dep — import lazily to avoid a hard dependency
          try {
            await import('@roost/queue');
          } catch {
            throw new Error(
              `[roost/events] Listener "${ListenerCls.name}" implements ShouldQueue but @roost/queue is not installed.`
            );
          }
          await (ListenerCls as unknown as { dispatch(payload: unknown): Promise<void> }).dispatch(event);
          return;
        }

        await listener.handle(event);
      })
    );

    // Broadcast if the event implements BroadcastableEvent
    if ('broadcastOn' in event && typeof (event as Record<string, unknown>).broadcastOn === 'function') {
      try {
        const { BroadcastManager } = await import('@roost/broadcast');
        await BroadcastManager.get().broadcast(
          event as import('@roost/broadcast').BroadcastableEvent
        );
      } catch {
        // @roost/broadcast not installed or BroadcastManager not initialized — skip
        // eslint-disable-next-line no-console
        console.warn('[roost/events] @roost/broadcast is not installed or BroadcastManager is not initialized.');
      }
    }
  }
}
