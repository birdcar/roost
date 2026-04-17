import type { ProviderRequest, ProviderResponse, StreamEvent } from '../types.js';
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
  // rerank, image, audio, transcribe, files, stores arrive in later phases.
}
