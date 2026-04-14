import { describe, test, expect } from 'bun:test';
import { KVStore } from '../src/bindings/kv';
import { VersionedKVStore } from '../src/bindings/versioned-kv';

interface MockEntry {
  value: string;
  metadata: unknown;
  expirationTtl?: number;
}

function createMockKV(): { ns: KVNamespace; store: Map<string, MockEntry> } {
  const store = new Map<string, MockEntry>();

  const ns: KVNamespace = {
    get(key: string, type?: any) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (type === 'json') return Promise.resolve(JSON.parse(entry.value));
      return Promise.resolve(entry.value);
    },
    getWithMetadata(key: string, type?: any) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve({ value: null, metadata: null });
      const value = type === 'json' ? JSON.parse(entry.value) : entry.value;
      return Promise.resolve({ value, metadata: entry.metadata });
    },
    put(key: string, value: any, options?: any) {
      store.set(key, {
        value: String(value),
        metadata: options?.metadata,
        expirationTtl: options?.expirationTtl,
      });
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list(options?: any) {
      const keys = [...store.keys()]
        .filter((k) => !options?.prefix || k.startsWith(options.prefix))
        .map((name) => ({ name, expiration: undefined, metadata: store.get(name)?.metadata }));
      return Promise.resolve({ keys, list_complete: true, cursor: '', cacheStatus: null });
    },
  } as unknown as KVNamespace;

  return { ns, store };
}

async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('VersionedKVStore', () => {
  test('put writes a content key with prefix "content:" and a pointer key with prefix "ptr:"', async () => {
    const { ns, store } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    await vkv.put('config', { theme: 'dark' });

    const keys = [...store.keys()];
    expect(keys.some((k) => k.startsWith('content:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('ptr:'))).toBe(true);
    expect(keys.some((k) => k === 'ptr:config')).toBe(true);
  });

  test('put returns the SHA-256 hex hash of the serialized value', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const value = { theme: 'dark' };
    const hash = await vkv.put('config', value);
    const expected = await sha256hex(JSON.stringify(value));

    expect(hash).toBe(expected);
  });

  test('get returns the original value', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    await vkv.put('config', { theme: 'dark' });
    const result = await vkv.get<{ theme: string }>('config');

    expect(result).toEqual({ theme: 'dark' });
  });

  test('get returns null for a key that was never written', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    expect(await vkv.get('nonexistent')).toBeNull();
  });

  test('get returns null when the pointer exists but the content key has expired', async () => {
    const { ns, store } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash = await vkv.put('config', { theme: 'dark' });
    // Simulate content key expiry by deleting it directly from the mock store
    store.delete('content:' + hash);

    expect(await vkv.get('config')).toBeNull();
  });

  test('put with the same value writes the same hash (deduplication)', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash1 = await vkv.put('a', { x: 1 });
    const hash2 = await vkv.put('a', { x: 1 });

    expect(hash1).toBe(hash2);
  });

  test('two different keys with identical values share the same content: key', async () => {
    const { ns, store } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash1 = await vkv.put('key-a', { x: 1 });
    const hash2 = await vkv.put('key-b', { x: 1 });

    expect(hash1).toBe(hash2);

    const contentKeys = [...store.keys()].filter((k) => k.startsWith('content:'));
    expect(contentKeys.length).toBe(1);
  });

  test('getVersion returns the current hash', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash = await vkv.put('config', { theme: 'dark' });
    expect(await vkv.getVersion('config')).toBe(hash);
  });

  test('getVersion returns null for an unknown key', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    expect(await vkv.getVersion('unknown')).toBeNull();
  });

  test('isCurrent returns true when the hash matches the current version', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash = await vkv.put('config', { theme: 'dark' });
    expect(await vkv.isCurrent('config', hash)).toBe(true);
  });

  test('isCurrent returns false when the hash does not match', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    await vkv.put('config', { theme: 'dark' });
    expect(await vkv.isCurrent('config', 'stale-hash')).toBe(false);
  });

  test('delete removes the pointer key; subsequent get returns null', async () => {
    const { ns } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    await vkv.put('config', { theme: 'dark' });
    await vkv.delete('config');

    expect(await vkv.get('config')).toBeNull();
  });

  test('content key is written with expirationTtl set to the configured value', async () => {
    const { ns, store } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns), { contentTtl: 3600 });

    const hash = await vkv.put('config', { x: 1 });
    const entry = store.get('content:' + hash);

    expect(entry?.expirationTtl).toBe(3600);
  });

  test('content key uses default 86400 TTL when no option is provided', async () => {
    const { ns, store } = createMockKV();
    const vkv = new VersionedKVStore(new KVStore(ns));

    const hash = await vkv.put('config', { x: 1 });
    const entry = store.get('content:' + hash);

    expect(entry?.expirationTtl).toBe(86400);
  });

  test('accepts a raw KVNamespace in addition to a KVStore instance', async () => {
    const { ns } = createMockKV();
    // Pass raw KVNamespace (no KVStore wrapper)
    const vkv = new VersionedKVStore(ns);

    await vkv.put('config', { theme: 'light' });
    const result = await vkv.get<{ theme: string }>('config');

    expect(result).toEqual({ theme: 'light' });
  });
});
