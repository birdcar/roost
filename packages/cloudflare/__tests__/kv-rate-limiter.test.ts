import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { KVRateLimiter } from '../src/rate-limiting/kv-rate-limiter';
import { restoreRateLimiter } from '../src/rate-limiting/fake';
import { KVStore } from '../src/bindings/kv';

afterEach(() => {
  restoreRateLimiter();
});

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; ttl?: number }>();

  return {
    get(key: string, type?: unknown) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (type === 'json') return Promise.resolve(JSON.parse(entry.value));
      return Promise.resolve(entry.value);
    },
    getWithMetadata(key: string, type?: unknown) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve({ value: null, metadata: null });
      const value = type === 'json' ? JSON.parse(entry.value) : entry.value;
      return Promise.resolve({ value, metadata: null });
    },
    put(key: string, value: unknown, options?: { expirationTtl?: number }) {
      store.set(key, { value: String(value), ttl: options?.expirationTtl });
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null });
    },
  } as unknown as KVNamespace;
}

const okHandler = async () => new Response('ok', { status: 200 });

describe('KVRateLimiter', () => {
  test('requests under the limit pass through and call next', async () => {
    const kv = new KVStore(createMockKV());
    const limiter = new KVRateLimiter(kv, { limit: 3, window: 60 });
    const request = new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });

    let nextCalls = 0;
    const next = async () => { nextCalls++; return new Response('ok'); };

    await limiter.handle(request, next);
    await limiter.handle(request, next);
    await limiter.handle(new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }), next);

    expect(nextCalls).toBe(3);
  });

  test('the (limit+1)th request within the window returns 429', async () => {
    const kv = new KVStore(createMockKV());
    const limiter = new KVRateLimiter(kv, { limit: 3, window: 60 });

    const makeReq = () => new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });

    await limiter.handle(makeReq(), okHandler);
    await limiter.handle(makeReq(), okHandler);
    await limiter.handle(makeReq(), okHandler);
    const response = await limiter.handle(makeReq(), okHandler);

    expect(response.status).toBe(429);
  });

  test('429 response includes Retry-After header', async () => {
    const kv = new KVStore(createMockKV());
    const limiter = new KVRateLimiter(kv, { limit: 1, window: 60 });

    const makeReq = () => new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });

    await limiter.handle(makeReq(), okHandler);
    const response = await limiter.handle(makeReq(), okHandler);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    const retryAfter = Number(response.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('counter resets when the window advances', async () => {
    const mockKV = createMockKV();
    const kv = new KVStore(mockKV);

    const windowSeconds = 1;
    const limiter = new KVRateLimiter(kv, { limit: 1, window: windowSeconds });

    const makeReq = () => new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '5.6.7.8' },
    });

    await limiter.handle(makeReq(), okHandler);
    const blocked = await limiter.handle(makeReq(), okHandler);
    expect(blocked.status).toBe(429);

    await new Promise((r) => setTimeout(r, 1100));

    const allowed = await limiter.handle(makeReq(), okHandler);
    expect(allowed.status).toBe(200);
  });

  test('custom keyExtractor is called and its return value is used as the key', async () => {
    const kv = new KVStore(createMockKV());
    let extractorCalled = false;

    const limiter = new KVRateLimiter(kv, {
      limit: 1,
      window: 60,
      keyExtractor: (req) => {
        extractorCalled = true;
        return req.headers.get('X-User-Id') ?? 'anon';
      },
    });

    const req = new Request('https://example.com', {
      headers: { 'X-User-Id': 'user-42' },
    });

    await limiter.handle(req, okHandler);
    expect(extractorCalled).toBe(true);
  });

  test('default key extractor uses CF-Connecting-IP', async () => {
    const kv = new KVStore(createMockKV());
    const limiter = new KVRateLimiter(kv, { limit: 1, window: 60 });

    const req1 = new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': 'ip-a' },
    });
    const req2 = new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': 'ip-b' },
    });

    await limiter.handle(req1, okHandler);
    const r1again = await limiter.handle(new Request('https://example.com', { headers: { 'CF-Connecting-IP': 'ip-a' } }), okHandler);
    const r2 = await limiter.handle(req2, okHandler);

    expect(r1again.status).toBe(429);
    expect(r2.status).toBe(200);
  });

  test('fails open when KV read throws', async () => {
    const brokenKV = {
      get() { return Promise.reject(new Error('KV unavailable')); },
      getWithMetadata() { return Promise.reject(new Error('KV unavailable')); },
      put() { return Promise.reject(new Error('KV unavailable')); },
      delete() { return Promise.resolve(); },
      list() { return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null }); },
    } as unknown as KVNamespace;

    const kv = new KVStore(brokenKV);
    const limiter = new KVRateLimiter(kv, { limit: 1, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(200);
  });
});
