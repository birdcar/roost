import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { FeatureFlag } from '../src/feature-flag';
import { WorkOSFlagProvider } from '../src/providers/workos';
import { KVCacheFlagProvider } from '../src/providers/kv-cache';
import { KVFlagProvider } from '../src/providers/kv';

beforeEach(() => {
  FeatureFlag.restore();
});

afterEach(() => {
  FeatureFlag.restore();
});

function createMockKVNamespace(data: Record<string, unknown> = {}): KVNamespace {
  const store = new Map(Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get(key: string, type?: unknown) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (type === 'json') return Promise.resolve(JSON.parse(entry));
      return Promise.resolve(entry);
    },
    getWithMetadata(key: string, type?: unknown) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve({ value: null, metadata: null });
      const value = type === 'json' ? JSON.parse(entry) : entry;
      return Promise.resolve({ value, metadata: null });
    },
    put(key: string, value: unknown, options?: unknown) {
      store.set(key, String(value));
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null });
    },
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// --- WorkOSFlagProvider ---

describe('WorkOSFlagProvider', () => {
  test('returns true when WorkOS reports flag enabled', async () => {
    const provider = new WorkOSFlagProvider('sk_test_fake');
    // Mock the internal SDK call
    (provider as any).sdk = {
      featureFlags: {
        getFeatureFlag: async (_slug: string) => ({ enabled: true, defaultValue: false }),
      },
    };

    const result = await provider.evaluate('my-flag');
    expect(result).toBe(true);
  });

  test('returns false when WorkOS reports flag disabled', async () => {
    const provider = new WorkOSFlagProvider('sk_test_fake');
    (provider as any).sdk = {
      featureFlags: {
        getFeatureFlag: async (_slug: string) => ({ enabled: false, defaultValue: false }),
      },
    };

    const result = await provider.evaluate('my-flag');
    expect(result).toBe(false);
  });

  test('passes context through (does not throw)', async () => {
    const provider = new WorkOSFlagProvider('sk_test_fake');
    (provider as any).sdk = {
      featureFlags: {
        getFeatureFlag: async (_slug: string) => ({ enabled: true, defaultValue: false }),
      },
    };

    const result = await provider.evaluate('beta', { userId: 'u_123', organizationId: 'org_456' });
    expect(result).toBe(true);
  });

  test('integrates with FeatureFlag.isEnabled via configureProvider', async () => {
    const provider = new WorkOSFlagProvider('sk_test_fake');
    (provider as any).sdk = {
      featureFlags: {
        getFeatureFlag: async (slug: string) => ({ enabled: slug === 'active-flag', defaultValue: false }),
      },
    };

    FeatureFlag.configureProvider(provider);

    expect(await FeatureFlag.isEnabled('active-flag')).toBe(true);
    expect(await FeatureFlag.isEnabled('inactive-flag')).toBe(false);
  });
});

// --- KVFlagProvider ---

describe('KVFlagProvider', () => {
  test('returns stored boolean value', async () => {
    const kv = createMockKVNamespace({ 'my-flag': true });
    const provider = new KVFlagProvider(kv);

    const result = await provider.evaluate('my-flag');
    expect(result).toBe(true);
  });

  test('returns false for missing flag', async () => {
    const kv = createMockKVNamespace({});
    const provider = new KVFlagProvider(kv);

    const result = await provider.evaluate('missing');
    expect(result).toBe(false);
  });

  test('set() writes to KV', async () => {
    const kv = createMockKVNamespace({});
    const provider = new KVFlagProvider(kv);

    await provider.set('new-flag', true);
    expect(await provider.evaluate('new-flag')).toBe(true);
  });

  test('integrates with FeatureFlag.isEnabled via configureProvider', async () => {
    const kv = createMockKVNamespace({ 'beta': true, 'legacy': false });
    const provider = new KVFlagProvider(kv);

    FeatureFlag.configureProvider(provider);

    expect(await FeatureFlag.isEnabled('beta')).toBe(true);
    expect(await FeatureFlag.isEnabled('legacy')).toBe(false);
  });
});

// --- KVCacheFlagProvider ---

describe('KVCacheFlagProvider', () => {
  test('on cache miss, calls inner provider and caches result', async () => {
    let innerCalls = 0;
    const inner = {
      async evaluate(_key: string) {
        innerCalls++;
        return true as const;
      },
    };
    const kv = createMockKVNamespace({});
    const cached = new KVCacheFlagProvider(inner, kv);

    const result = await cached.evaluate('my-flag');
    expect(result).toBe(true);
    expect(innerCalls).toBe(1);
  });

  test('on cache hit, returns cached value without calling inner provider', async () => {
    let innerCalls = 0;
    const inner = {
      async evaluate(_key: string) {
        innerCalls++;
        return true as const;
      },
    };
    // Pre-populate the KV with the cached value
    const kv = createMockKVNamespace({ 'flag:my-flag': true });
    const cached = new KVCacheFlagProvider(inner, kv);

    const result = await cached.evaluate('my-flag');
    expect(result).toBe(true);
    expect(innerCalls).toBe(0);
  });

  test('cache key includes userId when context provided', async () => {
    let capturedKey = '';
    const inner = {
      async evaluate(_key: string) {
        return false as const;
      },
    };
    const kv = createMockKVNamespace({});
    const store = (kv as any)._store as Map<string, string>;
    const cached = new KVCacheFlagProvider(inner, kv);

    await cached.evaluate('my-flag', { userId: 'u_123' });

    const keys = [...store.keys()];
    expect(keys.some((k) => k.includes('u_123'))).toBe(true);
  });

  test('cache key includes organizationId when context provided', async () => {
    const inner = {
      async evaluate(_key: string) {
        return true as const;
      },
    };
    const kv = createMockKVNamespace({});
    const store = (kv as any)._store as Map<string, string>;
    const cached = new KVCacheFlagProvider(inner, kv);

    await cached.evaluate('beta', { organizationId: 'org_456' });

    const keys = [...store.keys()];
    expect(keys.some((k) => k.includes('org_456'))).toBe(true);
  });

  test('different users get separate cache entries', async () => {
    let callCount = 0;
    const inner = {
      async evaluate(_key: string, ctx?: { userId?: string }) {
        callCount++;
        return (ctx?.userId === 'u_1') as boolean;
      },
    };
    const kv = createMockKVNamespace({});
    const cached = new KVCacheFlagProvider(inner, kv);

    const r1 = await cached.evaluate('flag', { userId: 'u_1' });
    const r2 = await cached.evaluate('flag', { userId: 'u_2' });

    expect(r1).toBe(true);
    expect(r2).toBe(false);
    expect(callCount).toBe(2);
  });

  test('wrapping WorkOSFlagProvider: cache hit skips WorkOS call', async () => {
    const workosProvider = new WorkOSFlagProvider('sk_test_fake');
    let sdkCalls = 0;
    (workosProvider as any).sdk = {
      featureFlags: {
        getFeatureFlag: async (_slug: string) => {
          sdkCalls++;
          return { enabled: true, defaultValue: false };
        },
      },
    };

    const kv = createMockKVNamespace({ 'flag:new-dashboard': true });
    const cached = new KVCacheFlagProvider(workosProvider, kv);
    FeatureFlag.configureProvider(cached);

    await FeatureFlag.isEnabled('new-dashboard');
    expect(sdkCalls).toBe(0);
  });
});

// --- Feature.for() scoped evaluation ---

describe('Feature.for(context)', () => {
  test('active() returns true for enabled flag', async () => {
    FeatureFlag.fake({ 'beta': true });
    const scoped = FeatureFlag.for({ userId: 'u_1' });
    expect(await scoped.active('beta')).toBe(true);
  });

  test('active() returns false for disabled flag', async () => {
    FeatureFlag.fake({ 'beta': false });
    const scoped = FeatureFlag.for({ userId: 'u_1' });
    expect(await scoped.active('beta')).toBe(false);
  });

  test('value() returns flag value', async () => {
    FeatureFlag.fake({ 'color': 'blue' });
    const scoped = FeatureFlag.for({ userId: 'u_1' });
    expect(await scoped.value('color')).toBe('blue');
  });

  test('value() returns defaultValue when flag is missing', async () => {
    FeatureFlag.fake({});
    const scoped = FeatureFlag.for({ userId: 'u_1' });
    expect(await scoped.value('missing', 'red')).toBe('red');
  });

  test('passes context to provider', async () => {
    let receivedContext: unknown;
    const provider = {
      async evaluate(_key: string, ctx: unknown) {
        receivedContext = ctx;
        return true as const;
      },
    };
    FeatureFlag.configureProvider(provider);

    const scoped = FeatureFlag.for({ userId: 'u_123', organizationId: 'org_456' });
    await scoped.active('beta');

    expect(receivedContext).toEqual({ userId: 'u_123', organizationId: 'org_456' });
  });
});
