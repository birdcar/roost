import { describe, test, expect, afterEach } from 'bun:test';
import { DORateLimiter } from '../src/rate-limiting/do-rate-limiter';
import { restoreRateLimiter } from '../src/rate-limiting/fake';
import type { DurableObjectClient } from '../src/bindings/durable-objects';

afterEach(() => {
  restoreRateLimiter();
});

function createMockDOClient(responseFactory: (body: unknown) => { allowed: boolean; remaining: number; retryAfter?: number }): DurableObjectClient {
  const stub = {
    async fetch(_url: string, options?: RequestInit) {
      const body = JSON.parse(options?.body as string ?? '{}');
      const result = responseFactory(body);
      return Response.json(result);
    },
  };

  return {
    get(_name: string) {
      return stub as unknown as DurableObjectStub;
    },
    idFromName(_name: string) { return {} as DurableObjectId; },
    idFromString(_hex: string) { return {} as DurableObjectId; },
    newUniqueId() { return {} as DurableObjectId; },
  } as unknown as DurableObjectClient;
}

const okHandler = async () => new Response('ok', { status: 200 });

describe('DORateLimiter', () => {
  test('delegates to DO stub; allowed responses call next', async () => {
    const doClient = createMockDOClient(() => ({ allowed: true, remaining: 9 }));
    const limiter = new DORateLimiter(doClient, { limit: 10, window: 60 });

    const req = new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(200);
  });

  test('DO stub returning { allowed: false, retryAfter: 30 } produces 429 with Retry-After: 30', async () => {
    const doClient = createMockDOClient(() => ({ allowed: false, remaining: 0, retryAfter: 30 }));
    const limiter = new DORateLimiter(doClient, { limit: 10, window: 60 });

    const req = new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  test('key passed to DO is derived from keyExtractor', async () => {
    let capturedBody: unknown = null;
    const doClient = createMockDOClient((body) => {
      capturedBody = body;
      return { allowed: true, remaining: 9 };
    });

    const limiter = new DORateLimiter(doClient, {
      limit: 10,
      window: 60,
      keyExtractor: (req) => req.headers.get('X-Org-Id') ?? 'unknown',
    });

    const req = new Request('https://example.com', {
      headers: { 'X-Org-Id': 'org-abc' },
    });

    await limiter.handle(req, okHandler);
    expect((capturedBody as { key: string }).key).toBe('org-abc');
  });

  test('fails open when DO fetch throws', async () => {
    const brokenDO = {
      get() {
        return {
          fetch() { return Promise.reject(new Error('DO unavailable')); },
        } as unknown as DurableObjectStub;
      },
      idFromName() { return {} as DurableObjectId; },
      idFromString() { return {} as DurableObjectId; },
      newUniqueId() { return {} as DurableObjectId; },
    } as unknown as DurableObjectClient;

    const limiter = new DORateLimiter(brokenDO, { limit: 10, window: 60 });
    const req = new Request('https://example.com', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    const response = await limiter.handle(req, okHandler);
    expect(response.status).toBe(200);
  });
});
