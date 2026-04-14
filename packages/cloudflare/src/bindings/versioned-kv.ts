import { KVStore } from './kv.js';
import type { KVPutOptions } from './kv.js';

export interface VersionedKVOptions {
  /**
   * TTL in seconds for content keys. Defaults to 86400 (24h).
   *
   * Content keys that are no longer pointed to expire after this duration.
   * Applications writing more than once per day per key should use standard
   * KVStore instead — this trade-off is intentional. For high-frequency writes,
   * the default 24h TTL means orphaned entries survive longer than needed.
   *
   * Note: VersionedKVStore is not suitable for concurrent-write scenarios without
   * external coordination. KV does not support atomic compare-and-swap, so
   * concurrent puts for the same key use last-writer-wins semantics.
   */
  contentTtl?: number;
}

export class VersionedKVStore {
  private kv: KVStore;
  private contentTtl: number;

  constructor(kv: KVStore | KVNamespace, options?: VersionedKVOptions) {
    // Duck-type detection: a raw KVNamespace has get/put but not putJson
    if ('get' in kv && 'put' in kv && !('putJson' in kv)) {
      this.kv = new KVStore(kv as KVNamespace);
    } else {
      this.kv = kv as KVStore;
    }
    this.contentTtl = options?.contentTtl ?? 86400;
  }

  async put<T>(key: string, value: T): Promise<string> {
    const serialized = JSON.stringify(value);
    const hash = await sha256hex(serialized);
    // Always write the content key to reset its TTL, even if hash hasn't changed.
    // This prevents frequently-read content from expiring.
    await this.kv.put('content:' + hash, serialized, { expirationTtl: this.contentTtl } satisfies KVPutOptions);
    await this.kv.put('ptr:' + key, hash);
    return hash;
  }

  async get<T>(key: string): Promise<T | null> {
    const hash = await this.kv.get('ptr:' + key);
    if (hash === null) return null;
    const content = await this.kv.get('content:' + hash);
    // Content may have expired before the pointer was updated (edge case on very
    // short TTLs). Return null rather than throwing — the next put will overwrite.
    if (content === null) return null;
    return JSON.parse(content) as T;
  }

  async getVersion(key: string): Promise<string | null> {
    return this.kv.get('ptr:' + key);
  }

  async isCurrent(key: string, hash: string): Promise<boolean> {
    const current = await this.getVersion(key);
    return current === hash;
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete('ptr:' + key);
    // Content key expires naturally via TTL — no explicit delete needed.
  }
}

async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
