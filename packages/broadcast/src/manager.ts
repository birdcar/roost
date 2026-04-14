import { DurableObjectClient } from '@roostjs/cloudflare';
import type { BroadcastableEvent } from './event.js';
import { PrivateChannel, PresenceChannel } from './channel.js';
import type { BroadcastMessage } from './types.js';
import { BroadcastFake } from './fake.js';

const fakes = new WeakMap<typeof BroadcastManager, BroadcastFake>();

export class BroadcastManager {
  private static instance: BroadcastManager | null = null;

  constructor(private doClient: DurableObjectClient) {}

  static get(): BroadcastManager {
    if (!BroadcastManager.instance) {
      throw new Error('BroadcastManager not initialized. Register BroadcastServiceProvider.');
    }
    return BroadcastManager.instance;
  }

  static set(manager: BroadcastManager): void {
    BroadcastManager.instance = manager;
  }

  static fake(): void {
    fakes.set(BroadcastManager, new BroadcastFake());
  }

  static restore(): void {
    fakes.delete(BroadcastManager);
    BroadcastManager.instance = null;
  }

  static assertBroadcast(eventClass: { new (...args: unknown[]): BroadcastableEvent }): void {
    const fake = fakes.get(BroadcastManager);
    if (!fake) throw new Error('BroadcastManager.fake() was not called');
    const found = fake.broadcasts.some((b) => b.event instanceof eventClass);
    if (!found) {
      throw new Error(`Expected ${eventClass.name} to be broadcast, but it was not`);
    }
  }

  static assertBroadcastOn(channel: string): void {
    const fake = fakes.get(BroadcastManager);
    if (!fake) throw new Error('BroadcastManager.fake() was not called');
    const found = fake.broadcasts.some((b) => b.channel === channel);
    if (!found) {
      throw new Error(`Expected broadcast on channel "${channel}", but none was recorded`);
    }
  }

  async broadcast(event: BroadcastableEvent): Promise<void> {
    const fake = fakes.get(BroadcastManager);

    const channels = event.broadcastOn();
    const payload = event.broadcastWith();
    const eventName = event.broadcastAs?.() ?? (event as unknown as { constructor: { name: string } }).constructor.name;

    const message: BroadcastMessage = {
      event: eventName,
      data: payload,
    };

    await Promise.all(
      channels.map(async (channel) => {
        if (fake) {
          fake.recordBroadcast(event, channel.name);
          return;
        }

        const stub = this.doClient.get(channel.name);
        await stub.fetch(new Request('https://internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...message,
            type: channel instanceof PresenceChannel
              ? 'presence'
              : channel instanceof PrivateChannel
                ? 'private'
                : 'public',
          }),
        }));
      })
    );
  }
}
