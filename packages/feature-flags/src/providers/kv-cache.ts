import { KVStore } from '@roostjs/cloudflare';
import type { FlagContext, FlagProvider, FlagValue } from '../types.js';

function cacheKey(key: string, context?: FlagContext): string {
  if (!context || Object.keys(context).length === 0) {
    return `flag:${key}`;
  }
  const parts: string[] = [];
  if (context.userId) parts.push(`u:${context.userId}`);
  if (context.organizationId) parts.push(`o:${context.organizationId}`);
  return `flag:${key}:${parts.join(':')}`;
}

export class KVCacheFlagProvider implements FlagProvider {
  private store: KVStore;
  private ttl: number;
  private inner: FlagProvider;

  constructor(inner: FlagProvider, kv: KVNamespace, ttlSeconds = 60) {
    this.inner = inner;
    this.store = new KVStore(kv);
    this.ttl = ttlSeconds;
  }

  async evaluate(key: string, context?: FlagContext): Promise<FlagValue> {
    const ck = cacheKey(key, context);

    const cached = await this.store.get<FlagValue>(ck, 'json');
    if (cached !== null) {
      return cached;
    }

    const value = await this.inner.evaluate(key, context);

    await this.store.putJson(ck, value, { expirationTtl: this.ttl });

    return value;
  }
}
