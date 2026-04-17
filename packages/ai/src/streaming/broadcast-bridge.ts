import { BroadcastManager, type BroadcastableEvent, Channel } from '@roostjs/broadcast';
import type { StreamEvent } from '../types.js';
import type { StreamableAgentResponse } from './streamable-response.js';

/**
 * Bridges Phase 3 streaming into `@roostjs/broadcast`. Each `StreamEvent`
 * becomes a `StreamEventBroadcast` whose `broadcastOn()` returns the
 * caller-supplied channels and whose `broadcastWith()` returns the raw event
 * payload. `BroadcastManager.broadcast()` then routes to every connected
 * channel subscriber.
 */
export class StreamEventBroadcast implements BroadcastableEvent {
  constructor(
    public readonly event: StreamEvent,
    public readonly channels: Channel[],
  ) {}

  broadcastOn(): Channel[] {
    return this.channels;
  }

  broadcastWith(): Record<string, unknown> {
    return this.event as unknown as Record<string, unknown>;
  }

  broadcastAs(): string {
    return 'ai.stream';
  }
}

/**
 * Iterate `response` and broadcast every event to `channels` through the
 * registered `BroadcastManager`. Resolves when the stream closes.
 */
export async function broadcastStream(
  response: StreamableAgentResponse,
  ...channels: Channel[]
): Promise<void> {
  const manager = BroadcastManager.get();
  for await (const event of response) {
    await manager.broadcast(new StreamEventBroadcast(event, channels));
  }
}

/**
 * Broadcast a single event synchronously — bypasses the queue even if one
 * is configured. Thin wrapper for API parity with `broadcastNow` semantics.
 */
export async function broadcastNow(event: StreamEvent, ...channels: Channel[]): Promise<void> {
  await BroadcastManager.get().broadcast(new StreamEventBroadcast(event, channels));
}