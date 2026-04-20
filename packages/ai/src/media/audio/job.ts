import { Job, Queue } from '@roostjs/queue';
import type { AudioFormat } from '../../providers/interface.js';
import type { MediaProviderSelector } from '../shared/provider-resolver.js';

export interface AudioJobPayload {
  text: string;
  options: {
    gender?: 'male' | 'female';
    voice?: string;
    instructions?: string;
    format?: AudioFormat;
    speed?: number;
    providerOptions?: Record<string, unknown>;
    model?: string;
    timeout?: number;
  };
  providers?: string[];
  handleId: string;
}

@Queue('ai-media')
export class AudioJob extends Job<AudioJobPayload> {
  async handle(): Promise<void> {
    const { Audio } = await import('./builder.js');
    const { getAudioCallbackRegistry } = await import('./registry.js');

    try {
      let builder = Audio.of(this.payload.text);
      const opts = this.payload.options;
      if (opts.gender === 'male') builder = builder.male();
      else if (opts.gender === 'female') builder = builder.female();
      if (opts.voice) builder = builder.voice(opts.voice);
      if (opts.instructions) builder = builder.instructions(opts.instructions);
      if (opts.format) builder = builder.format(opts.format);
      if (typeof opts.speed === 'number') builder = builder.speed(opts.speed);
      if (opts.providerOptions) builder = builder.providerOptions(opts.providerOptions);
      if (opts.model) builder = builder.model(opts.model);
      if (typeof opts.timeout === 'number') builder = builder.timeout(opts.timeout);

      const selector = deserializeSelector(this.payload.providers);
      const response = await builder.generate(selector ? { provider: selector } : undefined);
      await getAudioCallbackRegistry().fulfill(this.payload.handleId, response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const { getAudioCallbackRegistry } = await import('./registry.js');
      await getAudioCallbackRegistry().reject(this.payload.handleId, error);
      throw error;
    }
  }
}

function deserializeSelector(providers: string[] | undefined): MediaProviderSelector | undefined {
  if (!providers || providers.length === 0) return undefined;
  if (providers.length === 1) return providers[0]!;
  return providers;
}
