import type { AIClient } from '@roostjs/cloudflare';
import { EmbeddingError } from './types.js';
import type { EmbeddingCache } from './embedding-cache.js';
import {
  GeneratingEmbeddings,
  EmbeddingsGenerated,
} from './events.js';
import { dispatchEvent } from '../events.js';

export interface EmbeddingPipelineOptions {
  cache?: EmbeddingCache;
  /** Default embedding cache TTL override (seconds). */
  cacheTtlSeconds?: number;
  /** Logical provider name used in event/cache keys. Defaults to 'workers-ai'. */
  provider?: string;
}

export interface EmbedCallOptions {
  /** `true` to use cache (default: true when a cache was injected), `false` to bypass, number for per-call TTL. */
  cache?: boolean | number;
}

export class EmbeddingPipeline {
  private readonly cache?: EmbeddingCache;
  private readonly cacheTtlSeconds?: number;
  private readonly providerName: string;

  constructor(
    private client: AIClient,
    private model = '@cf/baai/bge-base-en-v1.5',
    options: EmbeddingPipelineOptions = {},
  ) {
    this.cache = options.cache;
    this.cacheTtlSeconds = options.cacheTtlSeconds;
    this.providerName = options.provider ?? 'workers-ai';
  }

  async embed(texts: string[], options: EmbedCallOptions = {}): Promise<number[][]> {
    if (texts.length === 0) return [];

    const useCache = options.cache === undefined ? !!this.cache : options.cache !== false;
    const ttl = typeof options.cache === 'number' ? options.cache : this.cacheTtlSeconds;

    await dispatchEvent(GeneratingEmbeddings, new GeneratingEmbeddings(this.providerName, this.model, texts.length));

    const cache = this.cache;
    if (useCache && cache) {
      return this.embedWithCache(texts, cache, ttl);
    }

    const result = await this.runClient(texts);
    await dispatchEvent(EmbeddingsGenerated, new EmbeddingsGenerated(this.providerName, this.model, result.length));
    return result;
  }

  private async embedWithCache(
    texts: string[],
    cache: EmbeddingCache,
    ttl?: number,
  ): Promise<number[][]> {
    // Per-text get to count hits deterministically, then delegate misses to
    // `cache.withCache` so concurrent calls for the same text dedupe onto a
    // single provider call (spec Failure Mode: cache stampede).
    let hits = 0;
    const vectors = await Promise.all(
      texts.map(async (input) => {
        const key = { provider: this.providerName, model: this.model, input };
        const cached = await cache.get(key);
        if (cached) {
          hits++;
          return cached;
        }
        return cache.withCache(
          key,
          async () => {
            const [vec] = await this.runClient([input]);
            if (!vec) throw new EmbeddingError('Provider returned no vector for input');
            return vec;
          },
          ttl,
        );
      }),
    );

    await dispatchEvent(
      EmbeddingsGenerated,
      new EmbeddingsGenerated(this.providerName, this.model, vectors.length, hits),
    );
    return vectors;
  }

  private async runClient(texts: string[]): Promise<number[][]> {
    const result = await this.client.run<{ data: number[][] }>(this.model, { text: texts });

    if (!result || !('data' in result) || result.data === undefined || result.data === null) {
      throw new EmbeddingError('No embedding data returned from model');
    }

    if (result.data.length !== texts.length) {
      throw new EmbeddingError(
        `Embedding count mismatch: expected ${texts.length}, got ${result.data.length}`,
      );
    }

    return result.data;
  }
}
