import { Event } from '@roostjs/events';

/** Dispatched when a builder drops an option the provider doesn't support (e.g. DALL·E 3 `seed`). */
export class UnsupportedOptionDropped extends Event {
  constructor(
    public readonly capability: 'image' | 'audio' | 'transcribe',
    public readonly provider: string,
    public readonly option: string,
    public readonly reason?: string,
  ) {
    super();
  }
}
