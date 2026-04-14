import type { BroadcastableEvent } from './event.js';

export class BroadcastFake {
  public broadcasts: Array<{ event: BroadcastableEvent; channel: string }> = [];

  recordBroadcast(event: BroadcastableEvent, channel: string): void {
    this.broadcasts.push({ event, channel });
  }
}
