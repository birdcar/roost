import type {
  AIProvider,
  TimestampGranularity,
  TranscribeRequest,
} from '../../providers/interface.js';
import { CapabilityNotSupportedError } from '../../providers/interface.js';
import { dispatchEvent } from '../../events.js';
import { getStorageResolver } from '../../attachments/storable-file.js';
import {
  resolveMediaProviders,
  type MediaProviderSelector,
} from '../shared/provider-resolver.js';
import {
  generateHandleId,
  type MediaFulfillCallback,
  type MediaRejectCallback,
} from '../shared/media-callback-registry.js';
import { TranscriptionResponse } from './response.js';
import { TranscriptionPrompt, QueuedTranscriptionPrompt } from './prompt.js';
import { GeneratingTranscription, TranscriptionGenerated } from './events.js';
import { TranscriptionFake, type TranscriptionFakeResolver } from './testing.js';
import {
  getTranscriptionCallbackRegistry,
  setTranscriptionCallbackRegistry,
  resetTranscriptionCallbackRegistry,
} from './registry.js';
import { toBase64 } from '../../providers/attachment-encoding.js';
import type { AudioSourceRef } from './job.js';

type Source =
  | { kind: 'path'; path: string; mimeType: string }
  | { kind: 'storage'; key: string; disk?: string; mimeType: string }
  | { kind: 'upload'; file: Blob; mimeType: string }
  | { kind: 'string'; bytes: Uint8Array; mimeType: string };

let fake: TranscriptionFake | null = null;

export class TranscriptionBuilder {
  private _diarize = false;
  private _language?: string;
  private _prompt?: string;
  private _granularity?: TimestampGranularity;
  private _temperature?: number;
  private _providerOptions?: Record<string, unknown>;
  private _model?: string;
  private _timeout?: number;

  constructor(private readonly source: Source) {}

  diarize(): this {
    this._diarize = true;
    return this;
  }

  language(code: string): this {
    this._language = code;
    return this;
  }

  prompt(context: string): this {
    this._prompt = context;
    return this;
  }

  timestampGranularity(g: TimestampGranularity): this {
    this._granularity = g;
    return this;
  }

  temperature(t: number): this {
    if (t < 0 || t > 1) {
      throw new Error(`Transcription.temperature() expects a value in [0, 1]; received ${t}`);
    }
    this._temperature = t;
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

  async generate(opts: { provider?: MediaProviderSelector } = {}): Promise<TranscriptionResponse> {
    const promptObj = new TranscriptionPrompt(
      this.source.kind,
      this.source.mimeType,
      this._language,
      this._diarize,
      this._granularity,
      this._temperature,
      this._prompt,
      resolveProviderName(opts.provider),
    );

    if (fake) {
      fake.recordGenerated(promptObj);
      return fake.nextResponse(promptObj);
    }

    const providers = resolveMediaProviders('transcribe', opts.provider);
    const bytes = await this.loadBytes();
    const request: TranscribeRequest = {
      bytes,
      mimeType: this.source.mimeType,
      model: this._model,
      diarize: this._diarize || undefined,
      language: this._language,
      prompt: this._prompt,
      timestampGranularity: this._granularity,
      temperature: this._temperature,
      providerOptions: this._providerOptions,
      timeout: this._timeout,
    };

    await dispatchEvent(GeneratingTranscription, new GeneratingTranscription(promptObj));
    const raw = await callFirstCapable(providers, request);
    const response = new TranscriptionResponse(raw);
    await dispatchEvent(TranscriptionGenerated, new TranscriptionGenerated(promptObj, raw));
    return response;
  }

  queue(opts: { provider?: MediaProviderSelector; uploadUrl?: string } = {}): QueuedTranscriptionHandle {
    const handleId = generateHandleId('ai_transcription');
    const queuedPrompt = new QueuedTranscriptionPrompt(handleId, this.serializeOptions());

    if (fake) {
      fake.recordQueued(queuedPrompt);
      return new QueuedTranscriptionHandle(handleId);
    }

    const handle = new QueuedTranscriptionHandle(handleId);
    void (async () => {
      try {
        const audioRef = await this.serializeSource(opts.uploadUrl);
        const { TranscriptionJob } = await import('./job.js');
        await TranscriptionJob.dispatch({
          audioRef,
          options: {
            diarize: this._diarize || undefined,
            language: this._language,
            prompt: this._prompt,
            timestampGranularity: this._granularity,
            temperature: this._temperature,
            providerOptions: this._providerOptions,
            model: this._model,
            timeout: this._timeout,
          },
          providers: serializeSelector(opts.provider),
          handleId,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await getTranscriptionCallbackRegistry().reject(handleId, error);
      }
    })();

    return handle;
  }

  private async loadBytes(): Promise<Uint8Array> {
    if (this.source.kind === 'string') return this.source.bytes;
    if (this.source.kind === 'path') {
      const fs = await import('node:fs/promises').catch(() => null);
      if (!fs) {
        throw new Error(
          `Transcription.fromPath() is only available under Node/Bun. Use fromStorage() or fromUpload() under Cloudflare Workers.`,
        );
      }
      const buffer = await fs.readFile(this.source.path);
      return new Uint8Array(buffer);
    }
    if (this.source.kind === 'storage') {
      const resolver = getStorageResolver();
      if (!resolver) {
        throw new Error(
          `Transcription.fromStorage() requires a storage resolver. Call setStorageResolver() during app boot.`,
        );
      }
      const record = await resolver.get(this.source.key, { disk: this.source.disk });
      if (!record) throw new Error(`Transcription source not found in storage: ${this.source.key}`);
      return record.bytes;
    }
    const buffer = await this.source.file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async serializeSource(uploadUrl: string | undefined): Promise<AudioSourceRef> {
    if (this.source.kind === 'path') {
      return { kind: 'path', path: this.source.path, mimeType: this.source.mimeType };
    }
    if (this.source.kind === 'storage') {
      return {
        kind: 'storage',
        key: this.source.key,
        disk: this.source.disk,
        mimeType: this.source.mimeType,
      };
    }
    if (this.source.kind === 'upload') {
      if (!uploadUrl) {
        throw new Error(
          `Transcription.queue() on an fromUpload() source requires { uploadUrl } — uploads cannot be serialized inline. Persist the blob to R2 first and pass its URL.`,
        );
      }
      return { kind: 'upload', url: uploadUrl, mimeType: this.source.mimeType };
    }
    return { kind: 'string', base64: toBase64(this.source.bytes), mimeType: this.source.mimeType };
  }

  private serializeOptions(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this._diarize) out.diarize = true;
    if (this._language) out.language = this._language;
    if (this._prompt) out.prompt = this._prompt;
    if (this._granularity) out.granularity = this._granularity;
    if (typeof this._temperature === 'number') out.temperature = this._temperature;
    if (this._model) out.model = this._model;
    if (this._providerOptions) out.providerOptions = this._providerOptions;
    if (typeof this._timeout === 'number') out.timeout = this._timeout;
    return out;
  }
}

export class QueuedTranscriptionHandle {
  constructor(public readonly handleId: string) {}

  then(cb: MediaFulfillCallback<TranscriptionResponse>): this {
    getTranscriptionCallbackRegistry().onFulfilled(this.handleId, cb);
    return this;
  }

  catch(cb: MediaRejectCallback): this {
    getTranscriptionCallbackRegistry().onRejected(this.handleId, cb);
    return this;
  }
}

async function callFirstCapable(providers: AIProvider[], request: TranscribeRequest) {
  let lastError: unknown;
  for (const provider of providers) {
    if (typeof provider.transcribe !== 'function') {
      lastError = new CapabilityNotSupportedError('transcribe', provider.name);
      continue;
    }
    try {
      return await provider.transcribe(request);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No transcription-capable provider succeeded');
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
  if (Array.isArray(selector)) return selector.map((s) => (typeof s === 'string' ? s : s.name));
  return [typeof selector === 'string' ? selector : selector.name];
}

type TranscriptionPredicate = (prompt: TranscriptionPrompt) => boolean;
type QueuedPredicate = (prompt: QueuedTranscriptionPrompt) => boolean;

export const Transcription = {
  fromPath(path: string, opts: { mimeType?: string } = {}): TranscriptionBuilder {
    const mimeType = opts.mimeType ?? inferAudioMimeFromPath(path);
    return new TranscriptionBuilder({ kind: 'path', path, mimeType });
  },

  fromStorage(key: string, opts: { disk?: string; mimeType?: string } = {}): TranscriptionBuilder {
    const mimeType = opts.mimeType ?? inferAudioMimeFromPath(key);
    return new TranscriptionBuilder({ kind: 'storage', key, disk: opts.disk, mimeType });
  },

  fromUpload(file: Blob, opts: { mimeType?: string } = {}): TranscriptionBuilder {
    const mimeType = opts.mimeType ?? file.type ?? 'application/octet-stream';
    return new TranscriptionBuilder({ kind: 'upload', file, mimeType });
  },

  fromString(bytes: Uint8Array, mimeType: string): TranscriptionBuilder {
    return new TranscriptionBuilder({ kind: 'string', bytes, mimeType });
  },

  fake(responses?: TranscriptionFakeResolver): TranscriptionFake {
    fake = new TranscriptionFake(responses);
    return fake;
  },

  restore(): void {
    fake = null;
    resetTranscriptionCallbackRegistry();
  },

  preventStrayTranscription(): TranscriptionFake {
    if (!fake) fake = new TranscriptionFake();
    return fake.preventStrayTranscription();
  },

  assertGenerated(predicate?: TranscriptionPredicate): void {
    const f = requireFake();
    if (f.generated.length === 0) {
      throw new Error('Expected Transcription.generate() to be called, but it was not');
    }
    if (predicate && !f.generated.some(predicate)) {
      throw new Error('Expected a transcription to match the predicate, but none did');
    }
  },

  assertNotGenerated(predicate?: TranscriptionPredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.generated.length > 0) {
        throw new Error(`Expected no transcription generation, but ${f.generated.length} were recorded`);
      }
      return;
    }
    if (f.generated.some(predicate)) {
      throw new Error('Expected no transcription to match the predicate, but at least one did');
    }
  },

  assertNothingGenerated(): void {
    const f = requireFake();
    if (f.generated.length > 0) {
      throw new Error(`Expected no transcription generation, but ${f.generated.length} were recorded`);
    }
  },

  assertQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (f.queued.length === 0) {
      throw new Error('Expected Transcription.queue() to be called, but it was not');
    }
    if (predicate && !f.queued.some(predicate)) {
      throw new Error('Expected a queued transcription to match the predicate, but none did');
    }
  },

  assertNotQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.queued.length > 0) {
        throw new Error(`Expected no transcription queueing, but ${f.queued.length} were recorded`);
      }
      return;
    }
    if (f.queued.some(predicate)) {
      throw new Error('Expected no queued transcription to match the predicate, but at least one did');
    }
  },

  assertNothingQueued(): void {
    const f = requireFake();
    if (f.queued.length > 0) {
      throw new Error(`Expected no transcription queueing, but ${f.queued.length} were recorded`);
    }
  },
};

function requireFake(): TranscriptionFake {
  if (!fake) throw new Error('Transcription.fake() was not called');
  return fake;
}

function inferAudioMimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    flac: 'audio/flac',
    aac: 'audio/aac',
    webm: 'audio/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

export {
  getTranscriptionCallbackRegistry,
  setTranscriptionCallbackRegistry,
  resetTranscriptionCallbackRegistry,
};
