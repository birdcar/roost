import type { FlagValue, FlagStore, FlagContext, FlagProvider } from './types.js';
import { FlagStoreNotConfiguredError, FlagNotFoundError } from './errors.js';
import { FeatureFlagFake } from './fake.js';
import { getRequestCache } from './cache.js';

let store: FlagStore | null = null;
let provider: FlagProvider | null = null;
let activeFake: FeatureFlagFake | null = null;

function isTruthy(value: FlagValue | null): boolean {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (typeof value === 'number') return value > 0;
  return false;
}

async function resolveValue(flag: string, context?: FlagContext): Promise<FlagValue | null> {
  if (provider) {
    return provider.evaluate(flag, context);
  }
  if (store) {
    return store.get<FlagValue>(flag);
  }
  throw new FlagStoreNotConfiguredError();
}

export class ScopedFeatureFlag {
  constructor(private context: FlagContext) {}

  async active(flag: string): Promise<boolean> {
    if (activeFake) {
      return isTruthy(await activeFake.get(flag));
    }
    try {
      const value = await resolveValue(flag, this.context);
      return isTruthy(value);
    } catch {
      return false;
    }
  }

  async value<T extends FlagValue>(flag: string, defaultValue?: T): Promise<T | null> {
    if (activeFake) {
      const fakeValue = await activeFake.get<T>(flag);
      return fakeValue ?? (defaultValue ?? null);
    }
    const raw = await resolveValue(flag, this.context);
    if (raw === null) {
      if (defaultValue !== undefined) return defaultValue;
      throw new FlagNotFoundError(flag);
    }
    return raw as T;
  }
}

export class FeatureFlag {
  /**
   * Configure a legacy FlagStore (KV-only). Clears any active provider.
   */
  static configure(flagStore: FlagStore): void {
    store = flagStore;
    provider = null;
  }

  /**
   * Configure a FlagProvider (WorkOS, KVCache, etc). Clears legacy store.
   */
  static configureProvider(flagProvider: FlagProvider): void {
    provider = flagProvider;
    store = null;
  }

  /**
   * Configure both a FlagProvider for reads and a FlagStore for writes.
   * Used when WorkOS handles evaluation but KV handles FeatureFlag.set().
   */
  static configureProviderWithStore(flagProvider: FlagProvider, flagStore: FlagStore): void {
    provider = flagProvider;
    store = flagStore;
  }

  static for(context: FlagContext): ScopedFeatureFlag {
    return new ScopedFeatureFlag(context);
  }

  static async active(flag: string, request?: Request): Promise<boolean> {
    return FeatureFlag.isEnabled(flag, request);
  }

  static async value<T extends FlagValue>(flag: string, defaultValue?: T): Promise<T | null> {
    if (activeFake) {
      const fakeValue = await activeFake.get<T>(flag);
      return fakeValue ?? (defaultValue ?? null);
    }

    if (!store && !provider) {
      throw new FlagStoreNotConfiguredError();
    }

    const raw = await resolveValue(flag);
    if (raw === null) {
      if (defaultValue !== undefined) return defaultValue;
      throw new FlagNotFoundError(flag);
    }
    return raw as T;
  }

  static async isEnabled(flag: string, request?: Request): Promise<boolean> {
    if (request) {
      const cache = getRequestCache(request);
      if (cache?.has(flag)) {
        return isTruthy(cache.get(flag)!);
      }
    }

    if (activeFake) {
      const value = await activeFake.get(flag);
      return isTruthy(value);
    }

    if (!store && !provider) {
      throw new FlagStoreNotConfiguredError();
    }

    try {
      const value = await resolveValue(flag);

      if (request) {
        const cache = getRequestCache(request);
        if (cache) {
          cache.set(flag, value ?? false);
        }
      }

      return isTruthy(value);
    } catch {
      return false;
    }
  }

  static async getValue<T extends FlagValue>(flag: string, request?: Request): Promise<T | null> {
    if (request) {
      const cache = getRequestCache(request);
      if (cache?.has(flag)) {
        return cache.get(flag) as T;
      }
    }

    if (activeFake) {
      return activeFake.get<T>(flag);
    }

    if (!store && !provider) {
      throw new FlagStoreNotConfiguredError();
    }

    const value = (await resolveValue(flag)) as T | null;
    if (value === null) {
      throw new FlagNotFoundError(flag);
    }

    if (request) {
      const cache = getRequestCache(request);
      if (cache) {
        cache.set(flag, value);
      }
    }

    return value;
  }

  static async set<T extends FlagValue>(flag: string, value: T): Promise<void> {
    if (activeFake) {
      await activeFake.set(flag, value);
      return;
    }

    if (store) {
      await store.set(flag, value);
      return;
    }

    if (provider) {
      throw new Error(
        'FeatureFlag.set() requires a writable store. The active provider is read-only. ' +
        'Use configureProviderWithStore() to enable writes, or switch to KVFlagProvider.'
      );
    }

    throw new FlagStoreNotConfiguredError();
  }

  static fake(flags: Record<string, FlagValue>): void {
    activeFake = new FeatureFlagFake(flags);
  }

  static restore(): void {
    activeFake = null;
    store = null;
    provider = null;
  }

  static assertChecked(flag: string): void {
    if (!activeFake) {
      throw new Error('FeatureFlag.fake() was not called');
    }
    if (!activeFake.wasChecked(flag)) {
      throw new Error(`Expected flag "${flag}" to be checked, but it was not`);
    }
  }
}

export { FeatureFlag as Feature };
