import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BroadcastManager } from '../src/manager';
import { BroadcastFake } from '../src/fake';
import { PrivateChannel } from '../src/channel';
import type { BroadcastableEvent } from '../src/event';

class OrderShipped implements BroadcastableEvent {
  constructor(readonly orderId: string) {}
  broadcastOn() { return [new PrivateChannel(`order.${this.orderId}`)]; }
  broadcastWith() { return { orderId: this.orderId }; }
}

describe('BroadcastFake', () => {
  beforeEach(() => {
    BroadcastManager.restore();
  });

  afterEach(() => {
    BroadcastManager.restore();
  });

  test('recordBroadcast stores event and channel', () => {
    const fake = new BroadcastFake();
    const event = new OrderShipped('abc');
    fake.recordBroadcast(event, 'order.abc');

    expect(fake.broadcasts).toHaveLength(1);
    expect(fake.broadcasts[0].event).toBe(event);
    expect(fake.broadcasts[0].channel).toBe('order.abc');
  });

  test('BroadcastManager.restore() clears the fake and resets the singleton', () => {
    BroadcastManager.fake();

    expect(() => BroadcastManager.assertBroadcast(OrderShipped)).toThrow(
      'Expected OrderShipped to be broadcast'
    );

    BroadcastManager.restore();

    expect(() => BroadcastManager.assertBroadcast(OrderShipped)).toThrow(
      'BroadcastManager.fake() was not called'
    );
  });
});
