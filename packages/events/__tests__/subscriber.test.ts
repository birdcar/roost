import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Event } from '../src/event';
import { EventDispatcher } from '../src/dispatcher';
import { Subscriber } from '../src/subscriber';
import { EventServiceProvider } from '../src/provider';
import type { Application } from '@roost/core';
import type { EventClass } from '../src/types';

class OrderCreated extends Event {
  constructor(readonly orderId: string) { super(); }
}

class OrderShipped extends Event {
  constructor(readonly orderId: string) { super(); }
}

describe('Subscriber', () => {
  beforeEach(() => {
    EventDispatcher.set(new EventDispatcher());
    OrderCreated.restore();
    OrderShipped.restore();
  });

  afterEach(() => {
    EventDispatcher.set(new EventDispatcher());
    OrderCreated.restore();
    OrderShipped.restore();
  });

  test('subscriber methods are called when their mapped events are dispatched', async () => {
    const calls: string[] = [];

    class OrderSubscriber extends Subscriber {
      subscribe(): Map<EventClass<Event>, string> {
        return new Map([
          [OrderCreated as never, 'onOrderCreated'],
        ]);
      }

      onOrderCreated(_event: OrderCreated) {
        calls.push('created');
      }
    }

    const fakeApp = {
      container: {
        singleton: (_key: string, _fn: () => unknown) => {},
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {
      protected subscribers() {
        return [OrderSubscriber];
      }
    }

    const provider = new TestProvider(fakeApp);
    provider.register();

    await OrderCreated.dispatch(new OrderCreated('1'));
    expect(calls).toEqual(['created']);
  });

  test('multiple events in one subscriber each invoke their respective method', async () => {
    const calls: string[] = [];

    class OrderSubscriber extends Subscriber {
      subscribe(): Map<EventClass<Event>, string> {
        return new Map([
          [OrderCreated as never, 'onOrderCreated'],
          [OrderShipped as never, 'onOrderShipped'],
        ]);
      }

      onOrderCreated() { calls.push('created'); }
      onOrderShipped() { calls.push('shipped'); }
    }

    const fakeApp = {
      container: {
        singleton: (_key: string, _fn: () => unknown) => {},
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {
      protected subscribers() {
        return [OrderSubscriber];
      }
    }

    const provider = new TestProvider(fakeApp);
    provider.register();

    await OrderCreated.dispatch(new OrderCreated('1'));
    await OrderShipped.dispatch(new OrderShipped('2'));

    expect(calls).toEqual(['created', 'shipped']);
  });

  test('missing method name on subscriber throws during register()', () => {
    class BrokenSubscriber extends Subscriber {
      subscribe(): Map<EventClass<Event>, string> {
        return new Map([
          [OrderCreated as never, 'nonExistentMethod'],
        ]);
      }
    }

    const fakeApp = {
      container: {
        singleton: (_key: string, _fn: () => unknown) => {},
      },
      env: {},
    } as unknown as Application;

    class TestProvider extends EventServiceProvider {
      protected subscribers() {
        return [BrokenSubscriber];
      }
    }

    const provider = new TestProvider(fakeApp);
    expect(() => provider.register()).toThrow(
      'Subscriber method "nonExistentMethod" not found on BrokenSubscriber'
    );
  });
});
