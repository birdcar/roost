import { Event } from '@roostjs/events';
import type { TranscribeResponse } from '../../providers/interface.js';
import type { TranscriptionPrompt } from './prompt.js';

/** Dispatched immediately before a transcription provider is called. */
export class GeneratingTranscription extends Event {
  constructor(public readonly prompt: TranscriptionPrompt) {
    super();
  }
}

/** Dispatched after a transcription completes. */
export class TranscriptionGenerated extends Event {
  constructor(
    public readonly prompt: TranscriptionPrompt,
    public readonly response: TranscribeResponse,
  ) {
    super();
  }
}
