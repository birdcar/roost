import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BroadcastManager } from '../src/manager';
import { PrivateChannel, PresenceChannel, Channel } from '../src/channel';
import type { BroadcastableEvent } from '../src/event';
import { DurableObjectClient } from '@roostjs/cloudflare';

class OrderShipped implements BroadcastableEvent {
  constructor(readonly orderId: string) {}
  broadcastOn() { return [new PrivateChannel(`order.${this.orderId}`)]; }
  broadcastWith() { return { orderId: this.orderId }; }
}

class OrderCreated implements BroadcastableEvent {
  constructor(readonly orderId: string) {}
  broadcastOn() { return [new PrivateChannel(`order.${this.orderId}`)]; }
  broadcastWith() { return { orderId: this.orderId }; }
}

class MultiChannelEvent implements BroadcastableEvent {
  broadcastOn() {
    return [new Channel('public.updates'), new PresenceChannel('team.1')];
  }
  broadcastWith() { return { type: 'multi' }; }
}

describe('BroadcastManager', () => {
  beforeEach(() => {
    BroadcastManager.restore();
  });

  afterEach(() => {
    BroadcastManager.restore();
  });

  test('get() throws before BroadcastServiceProvider has been registered', () => {
    expect(() => BroadcastManager.get()).toThrow(
      'BroadcastManager not initialized. Register BroadcastServiceProvider.'
    );
  });

  test('fake() records broadcasts without calling DO stubs', async () => {
    BroadcastManager.fake();
    const manager = new BroadcastManager({} as DurableObjectClient);
    await manager.broadcast(new OrderShipped('123'));
    BroadcastManager.assertBroadcast(OrderShipped);
  });

  test('assertBroadcast passes when that event was broadcast', async () => {
    BroadcastManager.fake();
    const manager = new BroadcastManager({} as DurableObjectClient);
    await manager.broadcast(new OrderShipped('1'));
    expect(() => BroadcastManager.assertBroadcast(OrderShipped)).not.toThrow();
  });

  test('assertBroadcast throws when that event was not broadcast', () => {
    BroadcastManager.fake();
    expect(() => BroadcastManager.assertBroadcast(OrderCreated)).toThrow(
      'Expected OrderCreated to be broadcast, but it was not'
    );
  });

  test('assertBroadcastOn passes when a broadcast targeted that channel', async () => {
    BroadcastManager.fake();
    const manager = new BroadcastManager({} as DurableObjectClient);
    await manager.broadcast(new OrderShipped('123'));
    expect(() => BroadcastManager.assertBroadcastOn('order.123')).not.toThrow();
  });

  test('assertBroadcastOn throws when no broadcast targeted that channel', () => {
    BroadcastManager.fake();
    expect(() => BroadcastManager.assertBroadcastOn('order.999')).toThrow(
      'Expected broadcast on channel "order.999", but none was recorded'
    );
  });

  test('broadcast() sends to all channels returned by broadcastOn()', async () => {
    BroadcastManager.fake();
    const manager = new BroadcastManager({} as DurableObjectClient);
    await manager.broadcast(new MultiChannelEvent());

    BroadcastManager.assertBroadcastOn('public.updates');
    BroadcastManager.assertBroadcastOn('team.1');
  });

  test('broadcast() fetches POST /broadcast on the correct DO stub', async () => {
    const fetchedUrls: string[] = [];
    const mockStub = {
      fetch: async (req: Request) => {
        fetchedUrls.push(req.url);
        return new Response(null, { status: 204 });
      },
    };

    const mockDoClient = {
      get: (_name: string) => mockStub,
    } as unknown as DurableObjectClient;

    const manager = new BroadcastManager(mockDoClient);
    await manager.broadcast(new OrderShipped('456'));

    expect(fetchedUrls).toHaveLength(1);
    expect(fetchedUrls[0]).toBe('https://internal/broadcast');
  });
});
