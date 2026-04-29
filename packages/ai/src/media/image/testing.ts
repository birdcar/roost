import type { ImageResponse as ProviderImageResponse } from '../../providers/interface.js';
import { ImageResponse } from './response.js';
import type { ImagePrompt, QueuedImagePrompt } from './prompt.js';
import { base64ToBytes } from '../../internal/base64.js';

export type ImageFakeByte = Uint8Array | ProviderImageResponse | string;
export type ImageFakeResolver =
  | ImageFakeByte[]
  | ((prompt: ImagePrompt) => ImageFakeByte | Promise<ImageFakeByte>);

export class StrayImageError extends Error {
  override readonly name = 'StrayImageError';
  constructor(prompt: string) {
    super(`Stray Image generation (no matching fake): ${JSON.stringify(prompt).slice(0, 200)}`);
  }
}

/**
 * In-process fake backing `Image.fake()`. Records prompts, rotates through a
 * user-supplied response list, and optionally refuses unmatched prompts.
 */
export class ImageFake {
  readonly generated: ImagePrompt[] = [];
  readonly queued: QueuedImagePrompt[] = [];
  private index = 0;
  private preventStray = false;

  constructor(private resolver: ImageFakeResolver | undefined = undefined) {}

  preventStrayImages(): this {
    this.preventStray = true;
    return this;
  }

  recordGenerated(prompt: ImagePrompt): void {
    this.generated.push(prompt);
  }

  recordQueued(prompt: QueuedImagePrompt): void {
    this.queued.push(prompt);
  }

  async nextResponse(prompt: ImagePrompt): Promise<ImageResponse> {
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
      throw new StrayImageError(prompt.prompt);
    }
    return this.defaultResponse(prompt);
  }

  private toResponse(value: ImageFakeByte, prompt: ImagePrompt): ImageResponse {
    if (value instanceof Uint8Array) {
      return new ImageResponse({
        bytes: value,
        mimeType: 'image/png',
        model: 'fake',
        provider: prompt.provider,
      });
    }
    if (typeof value === 'string') {
      return new ImageResponse({
        bytes: decodeMaybeBase64(value),
        mimeType: 'image/png',
        model: 'fake',
        provider: prompt.provider,
      });
    }
    return new ImageResponse(value);
  }

  private defaultResponse(prompt: ImagePrompt): ImageResponse {
    return new ImageResponse({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: 'image/png',
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
