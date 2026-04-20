import type { KVStore } from '@roostjs/cloudflare';

export interface EmbeddingCacheKey {
  provider: string;
  model: string;
  dimensions?: number;
  input: string;
}

/**
 * KV-backed cache for text embeddings. Key is SHA-256(provider:model:dims:input)
 * so arbitrary inputs don't blow the 512-byte KV key ceiling. Default TTL is
 * 30 days.
 *
 * The cache also tracks in-flight SHA-keyed promises to prevent stampedes:
 * concurrent requests for the same text dedupe onto a single underlying call.
 */
export class EmbeddingCache {
  private readonly defaultTtl: number;
  private readonly inflight = new Map<string, Promise<number[]>>();

  constructor(private readonly kv: KVStore, ttlSeconds?: number) {
    this.defaultTtl = ttlSeconds ?? 60 * 60 * 24 * 30;
  }

  async get(key: EmbeddingCacheKey): Promise<number[] | null> {
    const hashed = await hashKey(key);
    const raw = await this.kv.get(`emb:${hashed}`, 'text');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }

  async set(key: EmbeddingCacheKey, vector: number[], ttlSeconds?: number): Promise<void> {
    const hashed = await hashKey(key);
    await this.kv.put(`emb:${hashed}`, JSON.stringify(vector), {
      expirationTtl: ttlSeconds ?? this.defaultTtl,
    });
  }

  /**
   * Run `compute` only if the cache misses. Concurrent callers for the same
   * key share a single compute call to avoid stampedes.
   */
  async withCache(key: EmbeddingCacheKey, compute: () => Promise<number[]>, ttlSeconds?: number): Promise<number[]> {
    const cached = await this.get(key);
    if (cached) return cached;

    const hashed = await hashKey(key);
    const existing = this.inflight.get(hashed);
    if (existing) return existing;

    const pending = (async () => {
      try {
        const vector = await compute();
        await this.set(key, vector, ttlSeconds);
        return vector;
      } finally {
        this.inflight.delete(hashed);
      }
    })();
    this.inflight.set(hashed, pending);
    return pending;
  }
}

async function hashKey(key: EmbeddingCacheKey): Promise<string> {
  const canonical = `${key.provider}:${key.model}:${key.dimensions ?? 'default'}:${key.input}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
