import { Job, Queue } from '@roostjs/queue';
import { BroadcastManager, Channel, type BroadcastableEvent } from '@roostjs/broadcast';
import type { StreamEvent } from '../types.js';
import { StreamEventBroadcast } from './broadcast-bridge.js';

/**
 * Queue job that re-hydrates a serialized `StreamEvent` + target channel
 * names and broadcasts via `BroadcastManager`. Enables
 * `broadcastOnQueue(channelName, event)` — the async path when producers
 * don't want to wait on WS fan-out.
 */
export interface BroadcastStreamPayload {
  event: StreamEvent;
  channelNames: string[];
}

@Queue('ai-broadcast')
export class BroadcastStreamJob extends Job<BroadcastStreamPayload> {
  async handle(): Promise<void> {
    const channels = this.payload.channelNames.map((name) => new Channel(name));
    const event: BroadcastableEvent = new StreamEventBroadcast(this.payload.event, channels);
    await BroadcastManager.get().broadcast(event);
  }
}

/**
 * Dispatch a broadcast to the `ai-broadcast` queue. The job broadcasts to the
 * supplied channels when it runs on the queue consumer.
 */
export async function broadcastOnQueue(
  event: StreamEvent,
  ...channels: Channel[]
): Promise<void> {
  await BroadcastStreamJob.dispatch({
    event,
    channelNames: channels.map((c) => c.name),
  });
}