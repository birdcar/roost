import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FeatureFlag } from '../src/feature-flag';
import { FeatureFlagMiddleware } from '../src/middleware';
import { getRequestCache } from '../src/cache';

beforeEach(() => {
  FeatureFlag.restore();
});

afterEach(() => {
  FeatureFlag.restore();
});

describe('FeatureFlagMiddleware', () => {
  test('batch-reads declared flags before calling next', async () => {
    let getCalls = 0;
    FeatureFlag.configure({
      async get(flag: string) {
        getCalls++;
        if (flag === 'feature-a') return true;
        if (flag === 'feature-b') return false;
        return null;
      },
      async set() {},
    });

    const middleware = new FeatureFlagMiddleware(['feature-a', 'feature-b']);
    const request = new Request('https://example.com');

    await middleware.handle(request, async () => new Response('ok'));
    expect(getCalls).toBe(2);
  });

  test('populates cache so subsequent isEnabled does not call the store again', async () => {
    let getCalls = 0;
    FeatureFlag.configure({
      async get(flag: string) {
        getCalls++;
        return flag === 'feature-a' ? true : null;
      },
      async set() {},
    });

    const middleware = new FeatureFlagMiddleware(['feature-a']);
    const request = new Request('https://example.com');

    await middleware.handle(request, async (req) => {
      getCalls = 0;
      await FeatureFlag.isEnabled('feature-a', req);
      return new Response('ok');
    });

    expect(getCalls).toBe(0);
  });

  test('cache is populated with flag values', async () => {
    FeatureFlag.configure({
      async get(flag: string) {
        return flag === 'feature-a' ? true : null;
      },
      async set() {},
    });

    const middleware = new FeatureFlagMiddleware(['feature-a']);
    const request = new Request('https://example.com');

    let cache: Map<string, unknown> | null = null;
    await middleware.handle(request, async (req) => {
      cache = getRequestCache(req);
      return new Response('ok');
    });

    expect(cache).not.toBeNull();
    expect(cache?.get('feature-a')).toBe(true);
  });

  test('calls next(request) and returns its response unmodified', async () => {
    FeatureFlag.fake({ 'feature-a': true });

    const middleware = new FeatureFlagMiddleware(['feature-a']);
    const request = new Request('https://example.com');

    const response = await middleware.handle(request, async () =>
      new Response('hello world', { status: 200 })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello world');
  });

  test('flags not in declared list are fetched lazily on first access', async () => {
    let lazyCalls = 0;
    FeatureFlag.configure({
      async get(flag: string) {
        if (flag === 'lazy-flag') lazyCalls++;
        return flag === 'lazy-flag' ? true : null;
      },
      async set() {},
    });

    const middleware = new FeatureFlagMiddleware([]);
    const request = new Request('https://example.com');

    await middleware.handle(request, async (req) => {
      await FeatureFlag.isEnabled('lazy-flag', req);
      return new Response('ok');
    });

    expect(lazyCalls).toBe(1);
  });
});
