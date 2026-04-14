import { ServiceProvider } from '@roost/core';
import { KVStore } from '@roost/cloudflare';
import { FeatureFlag } from './feature-flag.js';

export class FeatureFlagServiceProvider extends ServiceProvider {
  register(): void {
    const bindingName = this.app.config.get('flags.kv', 'FLAGS_KV') as string;
    const binding = this.app.env[bindingName];

    if (!binding) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[FeatureFlags] Binding "${bindingName}" not found in env. All feature flags will return false.`
        );
      }
      return;
    }

    const kvStore = new KVStore(binding as KVNamespace);

    FeatureFlag.configure({
      async get<T>(flag: string): Promise<T | null> {
        return kvStore.get<T>(flag, 'json');
      },
      async set<T>(flag: string, value: T): Promise<void> {
        await kvStore.putJson(flag, value);
      },
    });
  }
}
