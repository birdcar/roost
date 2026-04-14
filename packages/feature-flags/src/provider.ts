import { ServiceProvider } from '@roost/core';
import { KVStore } from '@roost/cloudflare';
import { FeatureFlag } from './feature-flag.js';
import { WorkOSFlagProvider } from './providers/workos.js';
import { KVCacheFlagProvider } from './providers/kv-cache.js';
import { KVFlagProvider } from './providers/kv.js';

export class FeatureFlagServiceProvider extends ServiceProvider {
  register(): void {
    const env = this.app.env as Record<string, unknown>;
    const configuredProvider = this.app.config.get('flags.provider', 'workos') as string;
    const kvBindingName = this.app.config.get('flags.kv', 'FLAGS_KV') as string;

    const apiKey = env.WORKOS_API_KEY as string | undefined;
    const kvBinding = env[kvBindingName] as KVNamespace | undefined;

    if (configuredProvider === 'workos' && apiKey) {
      const workosProvider = new WorkOSFlagProvider(apiKey);
      const readProvider = kvBinding
        ? new KVCacheFlagProvider(workosProvider, kvBinding)
        : workosProvider;

      if (kvBinding) {
        const kvStore = new KVStore(kvBinding);
        FeatureFlag.configureProviderWithStore(readProvider, {
          get: <T>(flag: string) => kvStore.get<T>(flag, 'json'),
          set: <T>(flag: string, value: T) => kvStore.putJson(flag, value),
        });
      } else {
        FeatureFlag.configureProvider(readProvider);
      }
      return;
    }

    if (kvBinding) {
      const kvProvider = new KVFlagProvider(kvBinding);
      const kvStore = new KVStore(kvBinding);
      FeatureFlag.configureProviderWithStore(kvProvider, {
        get: <T>(flag: string) => kvStore.get<T>(flag, 'json'),
        set: <T>(flag: string, value: T) => kvStore.putJson(flag, value),
      });
      return;
    }

    if (typeof console !== 'undefined') {
      console.warn(
        '[FeatureFlags] No WORKOS_API_KEY or KV binding found. All feature flags will throw unless fake() is active.'
      );
    }
  }
}
