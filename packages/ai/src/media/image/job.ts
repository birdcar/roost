import { Job, Queue } from '@roostjs/queue';
import type { StorableFileLike } from '../../types.js';
import type { ImageAspect, ImageQuality } from '../../providers/interface.js';
import type { MediaProviderSelector } from '../shared/provider-resolver.js';

export interface ImageJobPayload {
  prompt: string;
  options: {
    aspect?: ImageAspect;
    quality?: ImageQuality;
    steps?: number;
    seed?: number;
    negativePrompt?: string;
    providerOptions?: Record<string, unknown>;
    model?: string;
    timeout?: number;
  };
  /** Serialized provider selector — instance refs are not supported in queue payloads. */
  providers?: string[];
  handleId: string;
  /** Optional storable references passed by value (URL/file-id only — bytes aren't re-hydrated). */
  attachments?: StorableAttachmentRef[];
}

export interface StorableAttachmentRef {
  kind: 'url' | 'id' | 'storage';
  url?: string;
  fileId?: string;
  storageKey?: string;
  mimeType: string;
  name: string;
}

/**
 * Queue job for async image generation. Re-materializes the image request
 * on the consumer worker, calls the provider, and fulfills the callback
 * registry keyed by `handleId`.
 */
@Queue('ai-media')
export class ImageJob extends Job<ImageJobPayload> {
  async handle(): Promise<void> {
    const [builderMod, registryMod] = await Promise.all([
      import('./builder.js'),
      import('../shared/media-callback-registry.js'),
    ]);

    const { Image } = builderMod;
    const { getImageCallbackRegistry } = await import('./registry.js');

    try {
      let builder = Image.of(this.payload.prompt);
      const opts = this.payload.options;
      if (opts.aspect === 'square') builder = builder.square();
      else if (opts.aspect === 'portrait') builder = builder.portrait();
      else if (opts.aspect === 'landscape') builder = builder.landscape();
      if (opts.quality) builder = builder.quality(opts.quality);
      if (typeof opts.steps === 'number') builder = builder.steps(opts.steps);
      if (typeof opts.seed === 'number') builder = builder.seed(opts.seed);
      if (opts.negativePrompt) builder = builder.negativePrompt(opts.negativePrompt);
      if (opts.providerOptions) builder = builder.providerOptions(opts.providerOptions);
      if (opts.model) builder = builder.model(opts.model);
      if (typeof opts.timeout === 'number') builder = builder.timeout(opts.timeout);

      const attachments = rehydrateAttachments(this.payload.attachments);
      if (attachments.length > 0) builder = builder.attachments(attachments);

      const selector = deserializeSelector(this.payload.providers);
      const response = await builder.generate(selector ? { provider: selector } : undefined);
      await getImageCallbackRegistry().fulfill(this.payload.handleId, response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const { getImageCallbackRegistry } = await import('./registry.js');
      await getImageCallbackRegistry().reject(this.payload.handleId, error);
      throw error;
    }
    void registryMod;
  }
}

function deserializeSelector(providers: string[] | undefined): MediaProviderSelector | undefined {
  if (!providers || providers.length === 0) return undefined;
  if (providers.length === 1) return providers[0]!;
  return providers;
}

function rehydrateAttachments(refs: StorableAttachmentRef[] | undefined): StorableFileLike[] {
  if (!refs || refs.length === 0) return [];
  return refs.map((ref) => rehydrateOne(ref));
}

function rehydrateOne(ref: StorableAttachmentRef): StorableFileLike {
  return {
    name(): string {
      return ref.name;
    },
    mimeType(): string {
      return ref.mimeType;
    },
    async bytes(): Promise<Uint8Array> {
      if (ref.kind === 'url' && ref.url) {
        const response = await fetch(ref.url);
        if (!response.ok) throw new Error(`ImageJob: failed to fetch attachment URL (${ref.url})`);
        return new Uint8Array(await response.arrayBuffer());
      }
      throw new Error(`ImageJob: cannot rehydrate attachment of kind '${ref.kind}' — only 'url' is supported.`);
    },
  };
}
