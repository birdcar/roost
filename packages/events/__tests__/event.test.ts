import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Event } from '../src/event';
import { EventDispatcher } from '../src/dispatcher';

class OrderCreated extends Event {
  constructor(readonly orderId: string) { super(); }
}

class OrderShipped extends Event {
  constructor(readonly orderId: string) { super(); }
}

describe('Event', () => {
  beforeEach(() => {
    OrderCreated.restore();
    OrderShipped.restore();
    // Reset the dispatcher singleton so dispatch does not blow up when no fake is active
    EventDispatcher.set(new EventDispatcher());
  });

  afterEach(() => {
    OrderCreated.restore();
    OrderShipped.restore();
    EventDispatcher.set(new EventDispatcher());
  });

  test('dispatch calls EventDispatcher when no fake is active', async () => {
    const calls: Event[] = [];
    const dispatcher = new EventDispatcher();

    class TrackingListener {
      handle(event: unknown) { calls.push(event as Event); }
    }

    dispatcher.registerListener(OrderCreated as never, TrackingListener as never);
    EventDispatcher.set(dispatcher);

    await OrderCreated.dispatch(new OrderCreated('abc'));
    expect(calls).toHaveLength(1);
    expect((calls[0] as OrderCreated).orderId).toBe('abc');
  });

  test('fake intercepts dispatch without calling real dispatcher', async () => {
    const calls: Event[] = [];
    const dispatcher = new EventDispatcher();

    class TrackingListener {
      handle(event: unknown) { calls.push(event as Event); }
    }

    dispatcher.registerListener(OrderCreated as never, TrackingListener as never);
    EventDispatcher.set(dispatcher);

    OrderCreated.fake();
    await OrderCreated.dispatch(new OrderCreated('xyz'));

    expect(calls).toHaveLength(0);
  });

  test('restore re-enables real dispatch', async () => {
    OrderCreated.fake();
    OrderCreated.restore();

    const calls: Event[] = [];
    const dispatcher = new EventDispatcher();

    class TrackingListener {
      handle(event: unknown) { calls.push(event as Event); }
    }

    dispatcher.registerListener(OrderCreated as never, TrackingListener as never);
    EventDispatcher.set(dispatcher);

    await OrderCreated.dispatch(new OrderCreated('zzz'));
    expect(calls).toHaveLength(1);
  });

  test('assertDispatched passes when the event was dispatched', async () => {
    OrderCreated.fake();
    await OrderCreated.dispatch(new OrderCreated('1'));
    expect(() => OrderCreated.assertDispatched()).not.toThrow();
  });

  test('assertDispatched throws when the event was not dispatched', () => {
    OrderCreated.fake();
    expect(() => OrderCreated.assertDispatched()).toThrow('Expected OrderCreated to be dispatched');
  });

  test('assertDispatched with callback passes when a dispatched event matches', async () => {
    OrderCreated.fake();
    await OrderCreated.dispatch(new OrderCreated('123'));
    expect(() => OrderCreated.assertDispatched((e) => e.orderId === '123')).not.toThrow();
  });

  test('assertDispatched with callback throws when no dispatched event matches', async () => {
    OrderCreated.fake();
    await OrderCreated.dispatch(new OrderCreated('456'));
    expect(() => OrderCreated.assertDispatched((e) => e.orderId === '999')).toThrow(
      'Expected OrderCreated to be dispatched matching the given callback'
    );
  });

  test('assertNotDispatched passes when the event was not dispatched', () => {
    OrderCreated.fake();
    expect(() => OrderCreated.assertNotDispatched()).not.toThrow();
  });

  test('assertNotDispatched throws when the event was dispatched', async () => {
    OrderCreated.fake();
    await OrderCreated.dispatch(new OrderCreated('1'));
    expect(() => OrderCreated.assertNotDispatched()).toThrow(
      'Expected OrderCreated not to be dispatched'
    );
  });

  test('fakes are per-class: faking OrderCreated does not affect OrderShipped', async () => {
    OrderCreated.fake();

    const calls: Event[] = [];
    const dispatcher = new EventDispatcher();

    class TrackingListener {
      handle(event: unknown) { calls.push(event as Event); }
    }

    dispatcher.registerListener(OrderShipped as never, TrackingListener as never);
    EventDispatcher.set(dispatcher);

    await OrderCreated.dispatch(new OrderCreated('1'));
    await OrderShipped.dispatch(new OrderShipped('2'));

    expect(calls).toHaveLength(1);
    expect((calls[0] as OrderShipped).orderId).toBe('2');
  });

  test('assertDispatched throws if fake() was not called first', () => {
    expect(() => OrderCreated.assertDispatched()).toThrow('OrderCreated.fake() was not called');
  });

  test('assertNotDispatched throws if fake() was not called first', () => {
    expect(() => OrderCreated.assertNotDispatched()).toThrow('OrderCreated.fake() was not called');
  });
});
