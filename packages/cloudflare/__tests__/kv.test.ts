import { describe, test, expect } from 'bun:test';
import { KVStore } from '../src/bindings/kv';

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata: unknown }>();

  return {
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
      store.set(key, { value: String(value), metadata: options?.metadata });
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
      return Promise.resolve({
        keys,
        list_complete: true,
        cursor: '',
        cacheStatus: null,
      });
    },
  } as unknown as KVNamespace;
}

describe('KVStore', () => {
  test('putJson and get json round-trip', async () => {
    const kv = new KVStore(createMockKV());

    await kv.putJson('user', { name: 'Alice', age: 30 });
    const result = await kv.get<{ name: string; age: number }>('user', 'json');

    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  test('get returns null for missing key', async () => {
    const kv = new KVStore(createMockKV());
    const result = await kv.get('missing');
    expect(result).toBeNull();
  });

  test('put and get text', async () => {
    const kv = new KVStore(createMockKV());
    await kv.put('key', 'hello');
    const result = await kv.get('key');
    expect(result).toBe('hello');
  });

  test('delete removes key', async () => {
    const kv = new KVStore(createMockKV());
    await kv.put('key', 'value');
    await kv.delete('key');
    const result = await kv.get('key');
    expect(result).toBeNull();
  });

  test('list returns stored keys', async () => {
    const kv = new KVStore(createMockKV());
    await kv.put('a', '1');
    await kv.put('b', '2');

    const result = await kv.list();
    expect(result.keys.length).toBe(2);
  });

  test('list filters by prefix', async () => {
    const kv = new KVStore(createMockKV());
    await kv.put('user:1', 'alice');
    await kv.put('user:2', 'bob');
    await kv.put('post:1', 'hello');

    const result = await kv.list({ prefix: 'user:' });
    expect(result.keys.length).toBe(2);
  });
});
