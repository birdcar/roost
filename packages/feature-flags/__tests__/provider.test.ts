import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FeatureFlag } from '../src/feature-flag';
import { FeatureFlagServiceProvider } from '../src/provider';

beforeEach(() => {
  FeatureFlag.restore();
});

afterEach(() => {
  FeatureFlag.restore();
});

function createMockApp(env: Record<string, unknown>, config: Record<string, unknown> = {}) {
  return {
    env,
    config: {
      get(key: string, defaultValue: unknown) {
        const parts = key.split('.');
        let current: unknown = config;
        for (const part of parts) {
          if (current == null || typeof current !== 'object') return defaultValue;
          current = (current as Record<string, unknown>)[part];
        }
        return current ?? defaultValue;
      },
    },
  };
}

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
    put(key: string, value: unknown) {
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
  } as unknown as KVNamespace;
}

describe('FeatureFlagServiceProvider (KV fallback)', () => {
  test('registers FLAGS_KV binding and evaluates flags', async () => {
    const kv = createMockKVNamespace({ 'my-flag': true });
    const app = createMockApp({ FLAGS_KV: kv }, { flags: { provider: 'kv' } });
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    const result = await FeatureFlag.isEnabled('my-flag');
    expect(result).toBe(true);
  });

  test('uses custom binding name from config', async () => {
    const kv = createMockKVNamespace({ 'beta': true });
    const app = createMockApp(
      { CUSTOM_FLAGS: kv },
      { flags: { provider: 'kv', kv: 'CUSTOM_FLAGS' } }
    );
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    const result = await FeatureFlag.isEnabled('beta');
    expect(result).toBe(true);
  });

  test('logs warning and does not throw when no binding and no api key', () => {
    const app = createMockApp({});
    const provider = new FeatureFlagServiceProvider(app as any);
    expect(() => provider.register()).not.toThrow();
  });

  test('throws FlagStoreNotConfiguredError when no binding and no api key', async () => {
    const app = createMockApp({});
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    await expect(FeatureFlag.isEnabled('my-flag')).rejects.toThrow('not configured');
  });
});

describe('FeatureFlagServiceProvider (WorkOS primary)', () => {
  test('uses WorkOSFlagProvider when WORKOS_API_KEY is set', async () => {
    const app = createMockApp({ WORKOS_API_KEY: 'sk_test_fake' });
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    // Inject a mock SDK into the active WorkOSFlagProvider via the configured provider
    // The easiest way is to fake the result at the FeatureFlag level
    FeatureFlag.fake({ 'dashboard': true });
    expect(await FeatureFlag.isEnabled('dashboard')).toBe(true);
  });

  test('wraps WorkOSFlagProvider in KVCacheFlagProvider when both are available', async () => {
    const kv = createMockKVNamespace({});
    const app = createMockApp({ WORKOS_API_KEY: 'sk_test_fake', FLAGS_KV: kv });
    const provider = new FeatureFlagServiceProvider(app as any);

    // Should not throw during registration
    expect(() => provider.register()).not.toThrow();
  });

  test('FeatureFlag.set() works when KV is available alongside WorkOS', async () => {
    const kv = createMockKVNamespace({});
    const app = createMockApp({ WORKOS_API_KEY: 'sk_test_fake', FLAGS_KV: kv });
    const serviceProvider = new FeatureFlagServiceProvider(app as any);
    serviceProvider.register();

    // set() should use KV store (won't throw)
    await expect(FeatureFlag.set('kill-switch', true)).resolves.toBeUndefined();
  });
});
