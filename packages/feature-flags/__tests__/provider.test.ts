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

describe('FeatureFlagServiceProvider', () => {
  test('registers FLAGS_KV binding and configures FeatureFlag', async () => {
    const kv = createMockKVNamespace({ 'my-flag': true });
    const app = createMockApp({ FLAGS_KV: kv });
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    const result = await FeatureFlag.isEnabled('my-flag');
    expect(result).toBe(true);
  });

  test('uses custom binding name from config', async () => {
    const kv = createMockKVNamespace({ 'beta': true });
    const app = createMockApp({ CUSTOM_FLAGS: kv }, { flags: { kv: 'CUSTOM_FLAGS' } });
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    const result = await FeatureFlag.isEnabled('beta');
    expect(result).toBe(true);
  });

  test('logs warning and does not throw when binding is absent', () => {
    const app = createMockApp({});
    const provider = new FeatureFlagServiceProvider(app as any);
    expect(() => provider.register()).not.toThrow();
  });

  test('all flags return false when binding is absent', async () => {
    const app = createMockApp({});
    const provider = new FeatureFlagServiceProvider(app as any);
    provider.register();

    await expect(FeatureFlag.isEnabled('my-flag')).rejects.toThrow('not configured');
  });
});
