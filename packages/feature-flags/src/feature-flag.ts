import type { FlagValue, FlagStore } from './types.js';
import { FlagStoreNotConfiguredError, FlagNotFoundError } from './errors.js';
import { FeatureFlagFake } from './fake.js';
import { getRequestCache } from './cache.js';

let store: FlagStore | null = null;
let activeFake: FeatureFlagFake | null = null;

function isTruthy(value: FlagValue | null): boolean {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (typeof value === 'number') return value > 0;
  return false;
}

export class FeatureFlag {
  static configure(flagStore: FlagStore): void {
    store = flagStore;
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

    if (!store) {
      throw new FlagStoreNotConfiguredError();
    }

    try {
      const value = await store.get<FlagValue>(flag);

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

    if (!store) {
      throw new FlagStoreNotConfiguredError();
    }

    const value = await store.get<T>(flag);
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

    if (!store) {
      throw new FlagStoreNotConfiguredError();
    }

    await store.set(flag, value);
  }

  static fake(flags: Record<string, FlagValue>): void {
    activeFake = new FeatureFlagFake(flags);
  }

  static restore(): void {
    activeFake = null;
    store = null;
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
