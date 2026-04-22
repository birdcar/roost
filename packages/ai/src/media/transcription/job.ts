import { Job, Queue } from '@roostjs/queue';
import type { TimestampGranularity } from '../../providers/interface.js';
import type { MediaProviderSelector } from '../shared/provider-resolver.js';

export type AudioSourceRef =
  | { kind: 'path'; path: string; mimeType: string }
  | { kind: 'storage'; key: string; disk?: string; mimeType: string }
  | { kind: 'upload'; url: string; mimeType: string }
  | { kind: 'string'; base64: string; mimeType: string };

export interface TranscriptionJobPayload {
  audioRef: AudioSourceRef;
  options: {
    diarize?: boolean;
    language?: string;
    prompt?: string;
    timestampGranularity?: TimestampGranularity;
    temperature?: number;
    providerOptions?: Record<string, unknown>;
    model?: string;
    timeout?: number;
  };
  providers?: string[];
  handleId: string;
}

@Queue('ai-media')
export class TranscriptionJob extends Job<TranscriptionJobPayload> {
  async handle(): Promise<void> {
    const { Transcription } = await import('./builder.js');
    const { getTranscriptionCallbackRegistry } = await import('./registry.js');

    try {
      const builder = await rehydrateBuilder(Transcription, this.payload.audioRef);
      const opts = this.payload.options;
      if (opts.diarize) builder.diarize();
      if (opts.language) builder.language(opts.language);
      if (opts.prompt) builder.prompt(opts.prompt);
      if (opts.timestampGranularity) builder.timestampGranularity(opts.timestampGranularity);
      if (typeof opts.temperature === 'number') builder.temperature(opts.temperature);
      if (opts.providerOptions) builder.providerOptions(opts.providerOptions);
      if (opts.model) builder.model(opts.model);
      if (typeof opts.timeout === 'number') builder.timeout(opts.timeout);

      const selector = deserializeSelector(this.payload.providers);
      const response = await builder.generate(selector ? { provider: selector } : undefined);
      await getTranscriptionCallbackRegistry().fulfill(this.payload.handleId, response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const { getTranscriptionCallbackRegistry } = await import('./registry.js');
      await getTranscriptionCallbackRegistry().reject(this.payload.handleId, error);
      throw error;
    }
  }
}

type TranscriptionNs = typeof import('./builder.js')['Transcription'];

async function rehydrateBuilder(
  Transcription: TranscriptionNs,
  ref: AudioSourceRef,
): Promise<ReturnType<TranscriptionNs['fromString']>> {
  if (ref.kind === 'path') return Transcription.fromPath(ref.path, { mimeType: ref.mimeType });
  if (ref.kind === 'storage') return Transcription.fromStorage(ref.key, { disk: ref.disk, mimeType: ref.mimeType });
  if (ref.kind === 'upload') {
    const response = await fetch(ref.url);
    if (!response.ok) throw new Error(`TranscriptionJob: failed to fetch upload URL (${ref.url})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return Transcription.fromString(bytes, ref.mimeType);
  }
  return Transcription.fromString(decodeBase64(ref.base64), ref.mimeType);
}

function decodeBase64(input: string): Uint8Array {
  const maybeBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: 'base64'): Uint8Array };
  };
  if (maybeBuffer.Buffer) {
    return new Uint8Array(maybeBuffer.Buffer.from(input, 'base64'));
  }
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function deserializeSelector(providers: string[] | undefined): MediaProviderSelector | undefined {
  if (!providers || providers.length === 0) return undefined;
  if (providers.length === 1) return providers[0]!;
  return providers;
}
