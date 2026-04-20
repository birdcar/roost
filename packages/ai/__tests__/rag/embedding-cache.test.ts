import { describe, it, expect } from 'bun:test';
import { EmbeddingCache } from '../../src/rag/embedding-cache.js';
import type { KVStore } from '@roostjs/cloudflare';

class FakeKV {
  store = new Map<string, { value: string; ttl?: number }>();

  async get(key: string, _type?: 'text' | 'json'): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, { value, ttl: opts?.expirationTtl });
  }
}

function makeCache(ttl?: number): { cache: EmbeddingCache; kv: FakeKV } {
  const kv = new FakeKV();
  const cache = new EmbeddingCache(kv as unknown as KVStore, ttl);
  return { cache, kv };
}

describe('EmbeddingCache', () => {
  it('returns null on miss', async () => {
    const { cache } = makeCache();
    const vec = await cache.get({ provider: 'p', model: 'm', input: 'hello' });
    expect(vec).toBeNull();
  });

  it('round-trips a vector through get/set', async () => {
    const { cache } = makeCache();
    const key = { provider: 'p', model: 'm', input: 'hello' };
    await cache.set(key, [0.1, 0.2, 0.3]);
    const vec = await cache.get(key);
    expect(vec).toEqual([0.1, 0.2, 0.3]);
  });

  it('hashes provider+model+dims+input so different keys miss each other', async () => {
    const { cache } = makeCache();
    await cache.set({ provider: 'a', model: 'm', input: 'x' }, [1]);
    expect(await cache.get({ provider: 'b', model: 'm', input: 'x' })).toBeNull();
    expect(await cache.get({ provider: 'a', model: 'n', input: 'x' })).toBeNull();
    expect(await cache.get({ provider: 'a', model: 'm', input: 'y' })).toBeNull();
    expect(await cache.get({ provider: 'a', model: 'm', input: 'x', dimensions: 512 })).toBeNull();
  });

  it('applies the default TTL when none is provided', async () => {
    const { cache, kv } = makeCache();
    await cache.set({ provider: 'p', model: 'm', input: 'x' }, [0.5]);
    const entry = [...kv.store.values()][0]!;
    expect(entry.ttl).toBe(60 * 60 * 24 * 30);
  });

  it('honors a per-call TTL override', async () => {
    const { cache, kv } = makeCache();
    await cache.set({ provider: 'p', model: 'm', input: 'x' }, [0.5], 60);
    const entry = [...kv.store.values()][0]!;
    expect(entry.ttl).toBe(60);
  });

  it('withCache calls compute only once under concurrent hits (stampede dedup)', async () => {
    const { cache } = makeCache();
    let called = 0;
    const compute = async () => {
      called++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return [0.9];
    };
    const key = { provider: 'p', model: 'm', input: 'race' };
    const [a, b, c] = await Promise.all([
      cache.withCache(key, compute),
      cache.withCache(key, compute),
      cache.withCache(key, compute),
    ]);
    expect(a).toEqual([0.9]);
    expect(b).toEqual([0.9]);
    expect(c).toEqual([0.9]);
    expect(called).toBe(1);
  });

  it('withCache returns cached value without calling compute when available', async () => {
    const { cache } = makeCache();
    const key = { provider: 'p', model: 'm', input: 'hit' };
    await cache.set(key, [0.1]);
    let called = 0;
    const vec = await cache.withCache(key, async () => {
      called++;
      return [0.2];
    });
    expect(vec).toEqual([0.1]);
    expect(called).toBe(0);
  });

  it('tolerates corrupted cache entries by returning null', async () => {
    const { cache, kv } = makeCache();
    const key = { provider: 'p', model: 'm', input: 'bad' };
    await cache.set(key, [1]);
    const storedKey = [...kv.store.keys()][0]!;
    kv.store.set(storedKey, { value: 'not-json' });
    expect(await cache.get(key)).toBeNull();
  });
});
