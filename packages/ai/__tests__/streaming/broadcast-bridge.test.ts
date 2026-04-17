import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { BroadcastManager, Channel } from '@roostjs/broadcast';
import type { StreamEvent } from '../../src/types.js';
import {
  StreamEventBroadcast,
  broadcastNow,
  broadcastStream,
} from '../../src/streaming/broadcast-bridge.js';

beforeEach(() => {
  // `.fake()` records invocations but needs an instance to exist so that
  // `BroadcastManager.get()` doesn't throw.
  BroadcastManager.set(new BroadcastManager(null as unknown as Parameters<typeof BroadcastManager>[0]));
  BroadcastManager.fake();
});

afterEach(() => {
  BroadcastManager.restore();
});

describe('StreamEventBroadcast', () => {
  it('implements BroadcastableEvent with the supplied channels and raw payload', () => {
    const event: StreamEvent = { type: 'text-delta', text: 'hi' };
    const broadcast = new StreamEventBroadcast(event, [new Channel('user:1')]);
    expect(broadcast.broadcastOn().map((c) => c.name)).toEqual(['user:1']);
    expect(broadcast.broadcastWith()).toEqual(event as unknown as Record<string, unknown>);
    expect(broadcast.broadcastAs()).toBe('ai.stream');
  });
});

describe('broadcastNow', () => {
  it('dispatches through BroadcastManager to the named channel', async () => {
    await broadcastNow({ type: 'text-delta', text: 'x' }, new Channel('alerts'));
    BroadcastManager.assertBroadcastOn('alerts');
  });
});

describe('broadcastStream', () => {
  it('iterates the response and broadcasts each event to all channels', async () => {
    async function* source(): AsyncIterable<StreamEvent> {
      yield { type: 'text-delta', text: 'a' };
      yield { type: 'text-delta', text: 'b' };
      yield { type: 'done' };
    }
    await broadcastStream(
      source() as unknown as Parameters<typeof broadcastStream>[0],
      new Channel('stream-test'),
    );
    BroadcastManager.assertBroadcastOn('stream-test');
  });
});