import { ServiceProvider } from '@roost/core';
import { KVStore } from './bindings/kv.js';
import { R2Storage } from './bindings/r2.js';
import { QueueSender } from './bindings/queues.js';
import { D1Database } from './bindings/d1.js';
import { AIClient } from './bindings/ai.js';
import { VectorStore } from './bindings/vectorize.js';
import { DurableObjectClient } from './bindings/durable-objects.js';
import { HyperdriveClient } from './bindings/hyperdrive.js';

export class CloudflareServiceProvider extends ServiceProvider {
  register(): void {
    const env = this.app.env as Record<string, unknown>;

    for (const [key, value] of Object.entries(env)) {
      if (value === null || value === undefined) continue;
      if (typeof value !== 'object') continue;

      this.registerBinding(key, value);
    }
  }

  private registerBinding(key: string, binding: object): void {
    if (this.isKVNamespace(binding)) {
      this.app.container.singleton(key as any, () => new KVStore(binding as KVNamespace));
    } else if (this.isR2Bucket(binding)) {
      this.app.container.singleton(key as any, () => new R2Storage(binding as R2Bucket));
    } else if (this.isD1Database(binding)) {
      this.app.container.singleton(key as any, () => new D1Database(binding as globalThis.D1Database));
    } else if (this.isQueue(binding)) {
      this.app.container.singleton(key as any, () => new QueueSender(binding as Queue));
    }
  }

  private isKVNamespace(obj: object): boolean {
    return 'get' in obj && 'put' in obj && 'delete' in obj && 'list' in obj;
  }

  private isR2Bucket(obj: object): boolean {
    return 'head' in obj && 'get' in obj && 'put' in obj && 'delete' in obj && 'list' in obj;
  }

  private isD1Database(obj: object): boolean {
    return 'prepare' in obj && 'batch' in obj && 'exec' in obj && 'dump' in obj;
  }

  private isQueue(obj: object): boolean {
    return 'send' in obj && 'sendBatch' in obj && !('get' in obj);
  }
}
