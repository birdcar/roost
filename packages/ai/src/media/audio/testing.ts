import type { AudioResponse as ProviderAudioResponse } from '../../providers/interface.js';
import { AudioResponse } from './response.js';
import type { AudioPrompt, QueuedAudioPrompt } from './prompt.js';
import { base64ToBytes } from '../../internal/base64.js';

export type AudioFakeByte = Uint8Array | ProviderAudioResponse | string;
export type AudioFakeResolver =
  | AudioFakeByte[]
  | ((prompt: AudioPrompt) => AudioFakeByte | Promise<AudioFakeByte>);

export class StrayAudioError extends Error {
  override readonly name = 'StrayAudioError';
  constructor(text: string) {
    super(`Stray Audio generation (no matching fake): ${JSON.stringify(text).slice(0, 200)}`);
  }
}

export class AudioFake {
  readonly generated: AudioPrompt[] = [];
  readonly queued: QueuedAudioPrompt[] = [];
  private index = 0;
  private preventStray = false;

  constructor(private resolver: AudioFakeResolver | undefined = undefined) {}

  preventStrayAudio(): this {
    this.preventStray = true;
    return this;
  }

  recordGenerated(prompt: AudioPrompt): void {
    this.generated.push(prompt);
  }

  recordQueued(prompt: QueuedAudioPrompt): void {
    this.queued.push(prompt);
  }

  async nextResponse(prompt: AudioPrompt): Promise<AudioResponse> {
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
      throw new StrayAudioError(prompt.text);
    }
    return this.defaultResponse(prompt);
  }

  private toResponse(value: AudioFakeByte, prompt: AudioPrompt): AudioResponse {
    if (value instanceof Uint8Array) {
      return new AudioResponse({
        bytes: value,
        format: prompt.format ?? 'mp3',
        mimeType: 'audio/mpeg',
        model: 'fake',
        provider: prompt.provider,
      });
    }
    if (typeof value === 'string') {
      return new AudioResponse({
        bytes: decodeMaybeBase64(value),
        format: prompt.format ?? 'mp3',
        mimeType: 'audio/mpeg',
        model: 'fake',
        provider: prompt.provider,
      });
    }
    return new AudioResponse(value);
  }

  private defaultResponse(prompt: AudioPrompt): AudioResponse {
    return new AudioResponse({
      bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
      format: prompt.format ?? 'mp3',
      mimeType: 'audio/mpeg',
      model: 'fake',
      provider: prompt.provider,
    });
  }
}

function decodeMaybeBase64(input: string): Uint8Array {
  try {
    return base64ToBytes(input);
  } catch {
    return new TextEncoder().encode(input);
  }
}
