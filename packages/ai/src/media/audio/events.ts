import { Event } from '@roostjs/events';
import type { AudioResponse } from '../../providers/interface.js';
import type { AudioPrompt } from './prompt.js';

/** Dispatched immediately before the audio (TTS) provider is called. */
export class GeneratingAudio extends Event {
  constructor(public readonly prompt: AudioPrompt) {
    super();
  }
}

/** Dispatched after the audio provider returns a final response. */
export class AudioGenerated extends Event {
  constructor(
    public readonly prompt: AudioPrompt,
    public readonly response: AudioResponse,
  ) {
    super();
  }
}
