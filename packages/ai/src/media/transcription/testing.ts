import type { TranscribeResponse as ProviderTranscribeResponse } from '../../providers/interface.js';
import { TranscriptionResponse } from './response.js';
import type { TranscriptionPrompt, QueuedTranscriptionPrompt } from './prompt.js';

export type TranscriptionFakeValue = ProviderTranscribeResponse | string;
export type TranscriptionFakeResolver =
  | TranscriptionFakeValue[]
  | ((prompt: TranscriptionPrompt) => TranscriptionFakeValue | Promise<TranscriptionFakeValue>);

export class StrayTranscriptionError extends Error {
  override readonly name = 'StrayTranscriptionError';
  constructor() {
    super('Stray Transcription generation (no matching fake)');
  }
}

export class TranscriptionFake {
  readonly generated: TranscriptionPrompt[] = [];
  readonly queued: QueuedTranscriptionPrompt[] = [];
  private index = 0;
  private preventStray = false;

  constructor(private resolver: TranscriptionFakeResolver | undefined = undefined) {}

  preventStrayTranscription(): this {
    this.preventStray = true;
    return this;
  }

  recordGenerated(prompt: TranscriptionPrompt): void {
    this.generated.push(prompt);
  }

  recordQueued(prompt: QueuedTranscriptionPrompt): void {
    this.queued.push(prompt);
  }

  async nextResponse(prompt: TranscriptionPrompt): Promise<TranscriptionResponse> {
    if (typeof this.resolver === 'function') {
      const value = await this.resolver(prompt);
      return this.toResponse(value, prompt);
    }
    if (Array.isArray(this.resolver) && this.resolver.length > 0) {
      const value = this.resolver[Math.min(this.index, this.resolver.length - 1)]!;
      this.index++;
      return this.toResponse(value, prompt);
    }
    if (this.preventStray) {
      throw new StrayTranscriptionError();
    }
    return this.defaultResponse(prompt);
  }

  private toResponse(value: TranscriptionFakeValue, prompt: TranscriptionPrompt): TranscriptionResponse {
    if (typeof value === 'string') {
      return new TranscriptionResponse({
        text: value,
        language: prompt.language,
        model: 'fake',
        provider: prompt.provider,
      });
    }
    return new TranscriptionResponse(value);
  }

  private defaultResponse(prompt: TranscriptionPrompt): TranscriptionResponse {
    return new TranscriptionResponse({
      text: '',
      language: prompt.language,
      model: 'fake',
      provider: prompt.provider,
    });
  }
}
