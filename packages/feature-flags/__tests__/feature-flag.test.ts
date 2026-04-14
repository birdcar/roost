import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FeatureFlag } from '../src/feature-flag';
import { FlagStoreNotConfiguredError } from '../src/errors';
import { setRequestCache } from '../src/cache';

beforeEach(() => {
  FeatureFlag.restore();
});

afterEach(() => {
  FeatureFlag.restore();
});

describe('FeatureFlag.isEnabled', () => {
  test('returns true for boolean true', async () => {
    FeatureFlag.fake({ 'my-flag': true });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(true);
  });

  test('returns true for string "true"', async () => {
    FeatureFlag.fake({ 'my-flag': 'true' });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(true);
  });

  test('returns true for positive number', async () => {
    FeatureFlag.fake({ 'my-flag': 1 });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(true);
  });

  test('returns false for boolean false', async () => {
    FeatureFlag.fake({ 'my-flag': false });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(false);
  });

  test('returns false for string "false"', async () => {
    FeatureFlag.fake({ 'my-flag': 'false' });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(false);
  });

  test('returns false for zero', async () => {
    FeatureFlag.fake({ 'my-flag': 0 });
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(false);
  });

  test('returns false for missing flag', async () => {
    FeatureFlag.fake({});
    expect(await FeatureFlag.isEnabled('missing-flag')).toBe(false);
  });

  test('throws FlagStoreNotConfiguredError when no store and no fake', async () => {
    expect(FeatureFlag.isEnabled('my-flag')).rejects.toThrow(FlagStoreNotConfiguredError);
  });

  test('uses request cache when present', async () => {
    let storeCalls = 0;
    FeatureFlag.configure({
      async get(flag: string) {
        storeCalls++;
        return true;
      },
      async set() {},
    });

    const request = new Request('https://example.com');
    const cache = new Map<string, boolean>([['my-flag', true]]);
    setRequestCache(request, cache as any);

    await FeatureFlag.isEnabled('my-flag', request);
    expect(storeCalls).toBe(0);
  });

  test('calls store when no cache on request', async () => {
    let storeCalls = 0;
    FeatureFlag.configure({
      async get(flag: string) {
        storeCalls++;
        return flag === 'my-flag' ? true : null;
      },
      async set() {},
    });

    const request = new Request('https://example.com');
    const result = await FeatureFlag.isEnabled('my-flag', request);
    expect(result).toBe(true);
    expect(storeCalls).toBe(1);
  });
});

describe('FeatureFlag.getValue', () => {
  test('returns typed value from fake store', async () => {
    FeatureFlag.fake({ 'button-color': 'blue' });
    const value = await FeatureFlag.getValue<string>('button-color');
    expect(value).toBe('blue');
  });

  test('returns object value', async () => {
    const config = { variant: 'A', threshold: 0.5 };
    FeatureFlag.fake({ 'experiment': config });
    const value = await FeatureFlag.getValue<typeof config>('experiment');
    expect(value).toEqual(config);
  });
});

describe('FeatureFlag.set', () => {
  test('writes to fake store and subsequent isEnabled reflects the update', async () => {
    FeatureFlag.fake({ 'my-flag': false });
    await FeatureFlag.set('my-flag', true);
    expect(await FeatureFlag.isEnabled('my-flag')).toBe(true);
  });
});
