import { KVStore } from '@roostjs/cloudflare';
import type { FlagContext, FlagProvider, FlagValue } from '../types.js';

export class KVFlagProvider implements FlagProvider {
  private store: KVStore;

  constructor(kv: KVNamespace) {
    this.store = new KVStore(kv);
  }

  async evaluate(key: string, _context?: FlagContext): Promise<FlagValue> {
    const value = await this.store.get<FlagValue>(key, 'json');
    return value ?? false;
  }

  async set<T extends FlagValue>(key: string, value: T): Promise<void> {
    await this.store.putJson(key, value);
  }
}
