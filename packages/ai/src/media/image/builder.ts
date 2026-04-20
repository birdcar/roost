import type {
  AIProvider,
  ImageAspect,
  ImageQuality,
  ImageRequest,
} from '../../providers/interface.js';
import { CapabilityNotSupportedError } from '../../providers/interface.js';
import type { StorableFileLike } from '../../types.js';
import { dispatchEvent } from '../../events.js';
import {
  resolveMediaProviders,
  type MediaProviderSelector,
} from '../shared/provider-resolver.js';
import { generateHandleId } from '../shared/media-callback-registry.js';
import { ImageResponse } from './response.js';
import { ImagePrompt, QueuedImagePrompt } from './prompt.js';
import { GeneratingImage, ImageGenerated } from './events.js';
import { ImageFake, type ImageFakeResolver } from './testing.js';
import {
  getImageCallbackRegistry,
  setImageCallbackRegistry,
  resetImageCallbackRegistry,
} from './registry.js';
import type { MediaFulfillCallback, MediaRejectCallback } from '../shared/media-callback-registry.js';

let fake: ImageFake | null = null;

export class ImageBuilder {
  private _aspect?: ImageAspect;
  private _quality?: ImageQuality;
  private _attachments?: readonly StorableFileLike[];
  private _steps?: number;
  private _seed?: number;
  private _negativePrompt?: string;
  private _providerOptions?: Record<string, unknown>;
  private _model?: string;
  private _timeout?: number;

  constructor(private readonly prompt: string) {}

  square(): this {
    this._aspect = 'square';
    return this;
  }

  portrait(): this {
    this._aspect = 'portrait';
    return this;
  }

  landscape(): this {
    this._aspect = 'landscape';
    return this;
  }

  quality(q: ImageQuality): this {
    this._quality = q;
    return this;
  }

  attachments(files: readonly StorableFileLike[]): this {
    this._attachments = files;
    return this;
  }

  steps(n: number): this {
    this._steps = n;
    return this;
  }

  seed(n: number): this {
    this._seed = n;
    return this;
  }

  negativePrompt(text: string): this {
    this._negativePrompt = text;
    return this;
  }

  providerOptions(options: Record<string, unknown>): this {
    this._providerOptions = { ...(this._providerOptions ?? {}), ...options };
    return this;
  }

  model(name: string): this {
    this._model = name;
    return this;
  }

  timeout(seconds: number): this {
    this._timeout = seconds;
    return this;
  }

  async generate(opts: { provider?: MediaProviderSelector } = {}): Promise<ImageResponse> {
    const promptObj = new ImagePrompt(
      this.prompt,
      this._aspect,
      this._quality,
      this._attachments,
      resolveProviderName(opts.provider),
      this.serializeOptions(),
    );

    if (fake) {
      fake.recordGenerated(promptObj);
      return fake.nextResponse(promptObj);
    }

    const providers = resolveMediaProviders('image', opts.provider);
    const request: ImageRequest = {
      prompt: this.prompt,
      aspect: this._aspect,
      quality: this._quality,
      referenceImages: this._attachments,
      steps: this._steps,
      seed: this._seed,
      negativePrompt: this._negativePrompt,
      providerOptions: this._providerOptions,
      model: this._model,
      timeout: this._timeout,
    };

    await dispatchEvent(GeneratingImage, new GeneratingImage(promptObj));
    const raw = await callFirstCapable(providers, request);
    const response = new ImageResponse(raw);
    await dispatchEvent(ImageGenerated, new ImageGenerated(promptObj, raw));
    return response;
  }

  queue(opts: { provider?: MediaProviderSelector } = {}): QueuedImageHandle {
    const handleId = generateHandleId('ai_image');
    const queuedPrompt = new QueuedImagePrompt(this.prompt, handleId, this.serializeOptions());

    if (fake) {
      fake.recordQueued(queuedPrompt);
      return new QueuedImageHandle(handleId);
    }

    const handle = new QueuedImageHandle(handleId);
    const payload = {
      prompt: this.prompt,
      options: {
        aspect: this._aspect,
        quality: this._quality,
        steps: this._steps,
        seed: this._seed,
        negativePrompt: this._negativePrompt,
        providerOptions: this._providerOptions,
        model: this._model,
        timeout: this._timeout,
      },
      providers: serializeSelector(opts.provider),
      handleId,
    };

    void (async () => {
      try {
        const { ImageJob } = await import('./job.js');
        await ImageJob.dispatch(payload);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await getImageCallbackRegistry().reject(handleId, error);
      }
    })();

    return handle;
  }

  private serializeOptions(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this._aspect) out.aspect = this._aspect;
    if (this._quality) out.quality = this._quality;
    if (typeof this._steps === 'number') out.steps = this._steps;
    if (typeof this._seed === 'number') out.seed = this._seed;
    if (this._negativePrompt) out.negativePrompt = this._negativePrompt;
    if (this._model) out.model = this._model;
    if (this._providerOptions) out.providerOptions = this._providerOptions;
    if (typeof this._timeout === 'number') out.timeout = this._timeout;
    return out;
  }
}

export class QueuedImageHandle {
  constructor(public readonly handleId: string) {}

  then(cb: MediaFulfillCallback<ImageResponse>): this {
    getImageCallbackRegistry().onFulfilled(this.handleId, cb);
    return this;
  }

  catch(cb: MediaRejectCallback): this {
    getImageCallbackRegistry().onRejected(this.handleId, cb);
    return this;
  }
}

async function callFirstCapable(providers: AIProvider[], request: ImageRequest) {
  let lastError: unknown;
  for (const provider of providers) {
    if (typeof provider.image !== 'function') {
      lastError = new CapabilityNotSupportedError('image', provider.name);
      continue;
    }
    try {
      return await provider.image(request);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No image-capable provider succeeded');
}

function resolveProviderName(selector: MediaProviderSelector | undefined): string {
  if (selector === undefined) return 'default';
  if (Array.isArray(selector)) {
    const first = selector[0];
    if (!first) return 'default';
    return typeof first === 'string' ? first : first.name;
  }
  return typeof selector === 'string' ? selector : selector.name;
}

function serializeSelector(selector: MediaProviderSelector | undefined): string[] | undefined {
  if (selector === undefined) return undefined;
  if (Array.isArray(selector)) {
    return selector.map((s) => (typeof s === 'string' ? s : s.name));
  }
  return [typeof selector === 'string' ? selector : selector.name];
}

type ImagePredicate = (prompt: ImagePrompt) => boolean;
type QueuedPredicate = (prompt: QueuedImagePrompt) => boolean;

export const Image = {
  of(prompt: string): ImageBuilder {
    return new ImageBuilder(prompt);
  },

  fake(responses?: ImageFakeResolver): ImageFake {
    fake = new ImageFake(responses);
    return fake;
  },

  restore(): void {
    fake = null;
    resetImageCallbackRegistry();
  },

  preventStrayImages(): ImageFake {
    if (!fake) fake = new ImageFake();
    return fake.preventStrayImages();
  },

  assertGenerated(predicate?: ImagePredicate): void {
    const f = requireFake();
    if (f.generated.length === 0) {
      throw new Error('Expected Image.generate() to be called, but it was not');
    }
    if (predicate && !f.generated.some(predicate)) {
      throw new Error('Expected an image generation to match the predicate, but none did');
    }
  },

  assertNotGenerated(predicate?: ImagePredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.generated.length > 0) {
        throw new Error(`Expected no image generation, but ${f.generated.length} were recorded`);
      }
      return;
    }
    if (f.generated.some(predicate)) {
      throw new Error('Expected no image generation to match the predicate, but at least one did');
    }
  },

  assertNothingGenerated(): void {
    const f = requireFake();
    if (f.generated.length > 0) {
      throw new Error(`Expected no image generation, but ${f.generated.length} were recorded`);
    }
  },

  assertQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (f.queued.length === 0) {
      throw new Error('Expected Image.queue() to be called, but it was not');
    }
    if (predicate && !f.queued.some(predicate)) {
      throw new Error('Expected a queued image to match the predicate, but none did');
    }
  },

  assertNotQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.queued.length > 0) {
        throw new Error(`Expected no image queueing, but ${f.queued.length} were recorded`);
      }
      return;
    }
    if (f.queued.some(predicate)) {
      throw new Error('Expected no queued image to match the predicate, but at least one did');
    }
  },

  assertNothingQueued(): void {
    const f = requireFake();
    if (f.queued.length > 0) {
      throw new Error(`Expected no image queueing, but ${f.queued.length} were recorded`);
    }
  },
};

function requireFake(): ImageFake {
  if (!fake) throw new Error('Image.fake() was not called');
  return fake;
}

export { getImageCallbackRegistry, setImageCallbackRegistry, resetImageCallbackRegistry };
