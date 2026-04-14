import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Event } from '../src/event';
import { EventDispatcher } from '../src/dispatcher';
import { EventServiceProvider } from '../src/provider';
import type { Application } from '@roost/core';
import type { EventClass, ListenerClass } from '../src/types';

class OrderCreated extends Event {
  constructor(readonly orderId: string) { super(); }
}

describe('EventServiceProvider', () => {
  beforeEach(() => {
    EventDispatcher.set(new EventDispatcher());
    OrderCreated.restore();
  });

  afterEach(() => {
    EventDispatcher.set(new EventDispatcher());
    OrderCreated.restore();
  });

  test('register() sets the global EventDispatcher instance', () => {
    const registeredKeys: string[] = [];

    const fakeApp = {
      container: {
        singleton: (key: string, _fn: () => unknown) => { registeredKeys.push(key); },
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {}
    const provider = new TestProvider(fakeApp);
    provider.register();

    expect(registeredKeys).toContain('events.dispatcher');
  });

  test('registered listeners are called when events are dispatched after boot', async () => {
    const calls: string[] = [];

    class OrderCreatedListener {
      handle() { calls.push('handled'); }
    }

    const fakeApp = {
      container: {
        singleton: (_key: string, _fn: () => unknown) => {},
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {
      protected listen(): Map<EventClass<Event>, ListenerClass[]> {
        return new Map([
          [OrderCreated as never, [OrderCreatedListener as never]],
        ]);
      }
    }

    const provider = new TestProvider(fakeApp);
    provider.register();

    await OrderCreated.dispatch(new OrderCreated('1'));
    expect(calls).toEqual(['handled']);
  });

  test('app.container.make("events.dispatcher") returns the configured dispatcher', () => {
    let stored: unknown;

    const fakeApp = {
      container: {
        singleton: (_key: string, fn: () => unknown) => {
          stored = fn();
        },
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {}
    const provider = new TestProvider(fakeApp);
    provider.register();

    expect(stored).toBeInstanceOf(EventDispatcher);
  });
});
