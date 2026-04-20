import type { ProviderRequest, ProviderResponse, StreamEvent, StorableFileLike } from '../types.js';
import type { Lab } from '../enums.js';

export type ProviderCapability =
  | 'chat'
  | 'stream'
  | 'embed'
  | 'rerank'
  | 'image'
  | 'audio'
  | 'transcribe'
  | 'files'
  | 'stores'
  | 'tools'
  | 'structured-output'
  | 'thinking';

export interface ProviderCapabilities {
  readonly name: Lab | string;
  readonly supported: ReadonlySet<ProviderCapability>;
  readonly cheapestChat?: string;
  readonly smartestChat?: string;
  readonly defaultEmbed?: string;
}

/** Embedding call shape. Concrete provider impls arrive in Phase 5. */
export interface EmbedRequest {
  model?: string;
  input: string[];
  dimensions?: number;
}

export interface EmbedResponse {
  data: number[][];
  model: string;
}

/* ---------------------------- Phase 6: Media ---------------------------- */

export type ImageAspect = 'square' | 'portrait' | 'landscape';
export type ImageQuality = 'low' | 'medium' | 'high';

export interface ImageRequest {
  prompt: string;
  model?: string;
  aspect?: ImageAspect;
  quality?: ImageQuality;
  /** Reference images for img-to-img — only consumed by providers that support it. */
  referenceImages?: readonly StorableFileLike[];
  /** Workers AI flux step count (provider-specific). */
  steps?: number;
  seed?: number;
  negativePrompt?: string;
  providerOptions?: Record<string, unknown>;
  /** HTTP timeout (seconds). */
  timeout?: number;
}

export interface ImageResponse {
  /** Raw image bytes. */
  bytes: Uint8Array;
  /** MIME type detected from the bytes — e.g. `image/png`. */
  mimeType: string;
  /** Model that produced the image. */
  model: string;
  /** Provider name that handled the request. */
  provider: string;
}

export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
export type AudioGender = 'male' | 'female';

export interface AudioRequest {
  text: string;
  model?: string;
  /** A provider-specific voice identifier, resolved from `.male()/.female()` when unset. */
  voice?: string;
  /** When voice is unset, the builder supplies a gender hint so the provider picks a default voice. */
  gender?: AudioGender;
  /** Style / tone guidance (OpenAI gpt-4o-mini-tts and ElevenLabs support this natively). */
  instructions?: string;
  format?: AudioFormat;
  /** Speed multiplier between 0.25 and 4.0. */
  speed?: number;
  providerOptions?: Record<string, unknown>;
  timeout?: number;
}

export interface AudioResponse {
  bytes: Uint8Array;
  format: AudioFormat;
  mimeType: string;
  model: string;
  provider: string;
}

export type TimestampGranularity = 'word' | 'segment';

export interface TranscribeRequest {
  /** Raw audio bytes to transcribe. */
  bytes: Uint8Array;
  mimeType: string;
  model?: string;
  diarize?: boolean;
  language?: string;
  /** Vocabulary or context hint passed to the model. */
  prompt?: string;
  timestampGranularity?: TimestampGranularity;
  temperature?: number;
  providerOptions?: Record<string, unknown>;
  timeout?: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface DiarizedSegment extends TranscriptionSegment {
  speaker: string;
}

export interface TranscribeResponse {
  text: string;
  segments?: TranscriptionSegment[];
  diarizedSegments?: DiarizedSegment[];
  language?: string;
  duration?: number;
  model: string;
  provider: string;
}

/**
 * Thrown when a builder or call-site targets a provider that doesn't declare
 * the requested capability. Caught by failover logic to route to the next
 * provider; otherwise surfaced to the caller.
 */
export class CapabilityNotSupportedError extends Error {
  override readonly name = 'CapabilityNotSupportedError';
  constructor(
    public readonly capability: ProviderCapability,
    public readonly provider: string,
    public readonly suggestion?: string,
  ) {
    const hint = suggestion ? ` — ${suggestion}` : '';
    super(`Provider '${provider}' does not support capability '${capability}'${hint}`);
  }
}

/** Thrown when audio exceeds a transcription provider's size limit and auto-chunking is unavailable. */
export class AudioTooLargeError extends Error {
  override readonly name = 'AudioTooLargeError';
  constructor(
    public readonly size: number,
    public readonly limit: number,
    public readonly provider: string,
  ) {
    super(
      `Audio is ${size} bytes, exceeding the ${limit}-byte limit for provider '${provider}'. Chunk the audio before transcribing.`,
    );
  }
}

/** Thrown when the requested voice ID is not recognised by the selected TTS provider. */
export class VoiceNotFoundError extends Error {
  override readonly name = 'VoiceNotFoundError';
  constructor(
    public readonly voice: string,
    public readonly provider: string,
  ) {
    super(`Voice '${voice}' is not available on provider '${provider}'`);
  }
}

/**
 * The canonical provider interface. All provider backends (Workers AI,
 * Gateway, native Anthropic/OpenAI/Gemini) implement this.
 *
 * Methods past `chat` are optional — consumers check
 * `provider.capabilities().supported.has('x')` before calling.
 */
export interface AIProvider {
  readonly name: string;
  capabilities(): ProviderCapabilities;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(request: ProviderRequest): AsyncIterable<StreamEvent>;
  embed?(request: EmbedRequest): Promise<EmbedResponse>;
  image?(request: ImageRequest): Promise<ImageResponse>;
  audio?(request: AudioRequest): Promise<AudioResponse>;
  transcribe?(request: TranscribeRequest): Promise<TranscribeResponse>;
  // rerank, files, stores arrive in later phases.
}
