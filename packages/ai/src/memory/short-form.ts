import type { StatefulAgent } from '../stateful/agent.js';

const STORAGE_PREFIX = 'mem:short:';

interface ShortFormCtx {
  readonly _ctx: {
    storage: {
      put(k: string, v: unknown): Promise<void>;
      get<T>(k: string): Promise<T | undefined>;
      delete(k: string): Promise<boolean | number>;
      list<T>(opts?: { prefix?: string }): Promise<Map<string, T>>;
    };
  };
}

/**
 * Writable short-form memory backed by the agent's DO storage. Scoped to the
 * current DO; cleared by `clear()` or by eviction when the agent shuts down.
 */
export class ShortFormMemory {
  constructor(private readonly agent: StatefulAgent) {}

  private get ctx(): ShortFormCtx['_ctx'] {
    return (this.agent as unknown as ShortFormCtx)._ctx;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.ctx.storage.put(STORAGE_PREFIX + key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.ctx.storage.get<T>(STORAGE_PREFIX + key);
  }

  async delete(key: string): Promise<void> {
    await this.ctx.storage.delete(STORAGE_PREFIX + key);
  }

  async clear(): Promise<void> {
    const map = await this.ctx.storage.list({ prefix: STORAGE_PREFIX });
    for (const key of map.keys()) await this.ctx.storage.delete(key);
  }

  async keys(): Promise<string[]> {
    const map = await this.ctx.storage.list({ prefix: STORAGE_PREFIX });
    return Array.from(map.keys()).map((k) => k.slice(STORAGE_PREFIX.length));
  }
}
