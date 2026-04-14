import { describe, test, expect, afterEach } from 'bun:test';
import { KVRateLimiter } from '../src/rate-limiting/kv-rate-limiter';
import { DORateLimiter } from '../src/rate-limiting/do-rate-limiter';
import { fakeRateLimiter, restoreRateLimiter } from '../src/rate-limiting/fake';
import { KVStore } from '../src/bindings/kv';
import type { DurableObjectClient } from '../src/bindings/durable-objects';

afterEach(() => {
  restoreRateLimiter();
});

function createNeverCalledKV(): KVStore {
  const kv = {
    get() { throw new Error('KV should not be called in fake mode'); },
    getWithMetadata() { throw new Error('KV should not be called in fake mode'); },
    put() { throw new Error('KV should not be called in fake mode'); },
    delete() { return Promise.resolve(); },
    list() { return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null }); },
  } as unknown as KVNamespace;
  return new KVStore(kv);
}

function createNeverCalledDO(): DurableObjectClient {
  return {
    get() {
      return {
        fetch() { throw new Error('DO should not be called in fake mode'); },
      } as unknown as DurableObjectStub;
    },
    idFromName() { return {} as DurableObjectId; },
    idFromString() { return {} as DurableObjectId; },
    newUniqueId() { return {} as DurableObjectId; },
  } as unknown as DurableObjectClient;
}

const okHandler = async () => new Response('ok', { status: 200 });

describe('RateLimiterFake', () => {
  test('fakeRateLimiter() returns a fake; KV rate limiter uses it when active', async () => {
    const fake = fakeRateLimiter();
    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });

    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    const response = await limiter.handle(req, okHandler);

    expect(response.status).toBe(200);
    fake.assertChecked('1.2.3.4');
  });

  test('fakeRateLimiter() returns a fake; DO rate limiter uses it when active', async () => {
    const fake = fakeRateLimiter();
    const limiter = new DORateLimiter(createNeverCalledDO(), { limit: 10, window: 60 });

    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    const response = await limiter.handle(req, okHandler);

    expect(response.status).toBe(200);
    fake.assertChecked('1.2.3.4');
  });

  test('fake.limitKey causes requests from that IP to get 429 (KV variant)', async () => {
    const fake = fakeRateLimiter();
    fake.limitKey('1.2.3.4');

    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(429);
  });

  test('fake.limitKey causes requests from that IP to get 429 (DO variant)', async () => {
    const fake = fakeRateLimiter();
    fake.limitKey('1.2.3.4');

    const limiter = new DORateLimiter(createNeverCalledDO(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(429);
  });

  test('assertLimited passes after a limited request', async () => {
    const fake = fakeRateLimiter();
    fake.limitKey('1.2.3.4');

    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    await limiter.handle(req, okHandler);
    expect(() => fake.assertLimited('1.2.3.4')).not.toThrow();
  });

  test('assertAllowed passes after an allowed request', async () => {
    const fake = fakeRateLimiter();

    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    await limiter.handle(req, okHandler);
    expect(() => fake.assertAllowed('1.2.3.4')).not.toThrow();
  });

  test('assertLimited throws when request was allowed', async () => {
    const fake = fakeRateLimiter();

    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    await limiter.handle(req, okHandler);
    expect(() => fake.assertLimited('1.2.3.4')).toThrow('was allowed');
  });

  test('assertAllowed throws when request was limited', async () => {
    const fake = fakeRateLimiter();
    fake.limitKey('1.2.3.4');

    const limiter = new KVRateLimiter(createNeverCalledKV(), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    await limiter.handle(req, okHandler);
    expect(() => fake.assertAllowed('1.2.3.4')).toThrow('was limited');
  });

  test('restoreRateLimiter removes the fake; real KV path is used', async () => {
    fakeRateLimiter();
    restoreRateLimiter();

    let kvCalled = false;
    const mockKV = {
      get() { kvCalled = true; return Promise.resolve(null); },
      getWithMetadata() { return Promise.resolve({ value: null, metadata: null }); },
      put() { return Promise.resolve(); },
      delete() { return Promise.resolve(); },
      list() { return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null }); },
    } as unknown as KVNamespace;

    const limiter = new KVRateLimiter(new KVStore(mockKV), { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    await limiter.handle(req, okHandler);
    expect(kvCalled).toBe(true);
  });
});
