import type { Channel } from './channel.js';

export interface BroadcastableEvent {
  broadcastOn(): Channel[];
  broadcastWith(): Record<string, unknown>;
  broadcastAs?(): string;
}
