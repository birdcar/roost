import type {
  AIProvider,
  AudioFormat,
  AudioGender,
  AudioRequest,
} from '../../providers/interface.js';
import { CapabilityNotSupportedError } from '../../providers/interface.js';
import { dispatchEvent } from '../../events.js';
import {
  resolveMediaProviders,
  type MediaProviderSelector,
} from '../shared/provider-resolver.js';
import { generateHandleId } from '../shared/media-callback-registry.js';
import type { MediaFulfillCallback, MediaRejectCallback } from '../shared/media-callback-registry.js';
import { AudioResponse } from './response.js';
import { AudioPrompt, QueuedAudioPrompt } from './prompt.js';
import { GeneratingAudio, AudioGenerated } from './events.js';
import { AudioFake, type AudioFakeResolver } from './testing.js';
import {
  getAudioCallbackRegistry,
  setAudioCallbackRegistry,
  resetAudioCallbackRegistry,
} from './registry.js';

export type StringableInput = string | { toString(): string };

let fake: AudioFake | null = null;

export class AudioBuilder {
  private _gender?: AudioGender;
  private _voice?: string;
  private _instructions?: string;
  private _format?: AudioFormat;
  private _speed?: number;
  private _providerOptions?: Record<string, unknown>;
  private _model?: string;
  private _timeout?: number;

  constructor(private readonly text: string) {}

  male(): this {
    this._gender = 'male';
    return this;
  }

  female(): this {
    this._gender = 'female';
    return this;
  }

  voice(idOrName: string): this {
    this._voice = idOrName;
    return this;
  }

  instructions(text: string): this {
    this._instructions = text;
    return this;
  }

  format(f: AudioFormat): this {
    this._format = f;
    return this;
  }

  speed(multiplier: number): this {
    if (multiplier < 0.25 || multiplier > 4) {
      throw new Error(`Audio.speed() requires a multiplier in [0.25, 4]; received ${multiplier}`);
    }
    this._speed = multiplier;
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

  async generate(opts: { provider?: MediaProviderSelector } = {}): Promise<AudioResponse> {
    const promptObj = new AudioPrompt(
      this.text,
      this._gender,
      this._voice,
      this._format,
      this._instructions,
      this._speed,
      resolveProviderName(opts.provider),
    );

    if (fake) {
      fake.recordGenerated(promptObj);
      return fake.nextResponse(promptObj);
    }

    const providers = resolveMediaProviders('audio', opts.provider);
    const request: AudioRequest = {
      text: this.text,
      voice: this._voice,
      gender: this._gender,
      instructions: this._instructions,
      format: this._format,
      speed: this._speed,
      providerOptions: this._providerOptions,
      model: this._model,
      timeout: this._timeout,
    };

    await dispatchEvent(GeneratingAudio, new GeneratingAudio(promptObj));
    const raw = await callFirstCapable(providers, request);
    const response = new AudioResponse(raw);
    await dispatchEvent(AudioGenerated, new AudioGenerated(promptObj, raw));
    return response;
  }

  queue(opts: { provider?: MediaProviderSelector } = {}): QueuedAudioHandle {
    const handleId = generateHandleId('ai_audio');
    const queuedPrompt = new QueuedAudioPrompt(this.text, handleId, this.serializeOptions());

    if (fake) {
      fake.recordQueued(queuedPrompt);
      return new QueuedAudioHandle(handleId);
    }

    const handle = new QueuedAudioHandle(handleId);
    const payload = {
      text: this.text,
      options: {
        gender: this._gender,
        voice: this._voice,
        instructions: this._instructions,
        format: this._format,
        speed: this._speed,
        providerOptions: this._providerOptions,
        model: this._model,
        timeout: this._timeout,
      },
      providers: serializeSelector(opts.provider),
      handleId,
    };

    void (async () => {
      try {
        const { AudioJob } = await import('./job.js');
        await AudioJob.dispatch(payload);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await getAudioCallbackRegistry().reject(handleId, error);
      }
    })();

    return handle;
  }

  private serializeOptions(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this._gender) out.gender = this._gender;
    if (this._voice) out.voice = this._voice;
    if (this._instructions) out.instructions = this._instructions;
    if (this._format) out.format = this._format;
    if (typeof this._speed === 'number') out.speed = this._speed;
    if (this._model) out.model = this._model;
    if (this._providerOptions) out.providerOptions = this._providerOptions;
    if (typeof this._timeout === 'number') out.timeout = this._timeout;
    return out;
  }
}

export class QueuedAudioHandle {
  constructor(public readonly handleId: string) {}

  then(cb: MediaFulfillCallback<AudioResponse>): this {
    getAudioCallbackRegistry().onFulfilled(this.handleId, cb);
    return this;
  }

  catch(cb: MediaRejectCallback): this {
    getAudioCallbackRegistry().onRejected(this.handleId, cb);
    return this;
  }
}

async function callFirstCapable(providers: AIProvider[], request: AudioRequest) {
  let lastError: unknown;
  for (const provider of providers) {
    if (typeof provider.audio !== 'function') {
      lastError = new CapabilityNotSupportedError('audio', provider.name);
      continue;
    }
    try {
      return await provider.audio(request);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No audio-capable provider succeeded');
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

type AudioPredicate = (prompt: AudioPrompt) => boolean;
type QueuedPredicate = (prompt: QueuedAudioPrompt) => boolean;

export const Audio = {
  of(input: StringableInput): AudioBuilder {
    const text = typeof input === 'string' ? input : input.toString();
    return new AudioBuilder(text);
  },

  fake(responses?: AudioFakeResolver): AudioFake {
    fake = new AudioFake(responses);
    return fake;
  },

  restore(): void {
    fake = null;
    resetAudioCallbackRegistry();
  },

  preventStrayAudio(): AudioFake {
    if (!fake) fake = new AudioFake();
    return fake.preventStrayAudio();
  },

  assertGenerated(predicate?: AudioPredicate): void {
    const f = requireFake();
    if (f.generated.length === 0) {
      throw new Error('Expected Audio.generate() to be called, but it was not');
    }
    if (predicate && !f.generated.some(predicate)) {
      throw new Error('Expected an audio generation to match the predicate, but none did');
    }
  },

  assertNotGenerated(predicate?: AudioPredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.generated.length > 0) {
        throw new Error(`Expected no audio generation, but ${f.generated.length} were recorded`);
      }
      return;
    }
    if (f.generated.some(predicate)) {
      throw new Error('Expected no audio generation to match the predicate, but at least one did');
    }
  },

  assertNothingGenerated(): void {
    const f = requireFake();
    if (f.generated.length > 0) {
      throw new Error(`Expected no audio generation, but ${f.generated.length} were recorded`);
    }
  },

  assertQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (f.queued.length === 0) {
      throw new Error('Expected Audio.queue() to be called, but it was not');
    }
    if (predicate && !f.queued.some(predicate)) {
      throw new Error('Expected a queued audio to match the predicate, but none did');
    }
  },

  assertNotQueued(predicate?: QueuedPredicate): void {
    const f = requireFake();
    if (predicate === undefined) {
      if (f.queued.length > 0) {
        throw new Error(`Expected no audio queueing, but ${f.queued.length} were recorded`);
      }
      return;
    }
    if (f.queued.some(predicate)) {
      throw new Error('Expected no queued audio to match the predicate, but at least one did');
    }
  },

  assertNothingQueued(): void {
    const f = requireFake();
    if (f.queued.length > 0) {
      throw new Error(`Expected no audio queueing, but ${f.queued.length} were recorded`);
    }
  },
};

function requireFake(): AudioFake {
  if (!fake) throw new Error('Audio.fake() was not called');
  return fake;
}

export { getAudioCallbackRegistry, setAudioCallbackRegistry, resetAudioCallbackRegistry };
