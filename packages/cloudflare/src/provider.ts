import { ServiceProvider } from '@roostjs/core';
import { KVStore } from './bindings/kv.js';
import { R2Storage } from './bindings/r2.js';
import { QueueSender } from './bindings/queues.js';
import { D1Database } from './bindings/d1.js';
import { AIClient } from './bindings/ai.js';
import { VectorStore } from './bindings/vectorize.js';
import { DurableObjectClient } from './bindings/durable-objects.js';
import { HyperdriveClient } from './bindings/hyperdrive.js';
import { DispatchNamespaceClient } from './bindings/dispatch.js';
import { ServiceClient } from './bindings/service.js';

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
    // R2 must be checked before KV: R2 is a superset of KV's duck-type (it also has `head`).
    // More-specific guards come first throughout this chain.
    if (this.isR2Bucket(binding)) {
      this.app.container.singleton(key as any, () => new R2Storage(binding as R2Bucket));
    } else if (this.isKVNamespace(binding)) {
      this.app.container.singleton(key as any, () => new KVStore(binding as KVNamespace));
    } else if (this.isD1Database(binding)) {
      this.app.container.singleton(key as any, () => new D1Database(binding as globalThis.D1Database));
    } else if (this.isQueue(binding)) {
      this.app.container.singleton(key as any, () => new QueueSender(binding as Queue));
    } else if (this.isAi(binding)) {
      this.app.container.singleton(key as any, () => new AIClient(binding as Ai));
    } else if (this.isVectorize(binding)) {
      this.app.container.singleton(key as any, () => new VectorStore(binding as VectorizeIndex));
    } else if (this.isDurableObjectNamespace(binding)) {
      this.app.container.singleton(key as any, () => new DurableObjectClient(binding as DurableObjectNamespace));
    } else if (this.isHyperdrive(binding)) {
      this.app.container.singleton(key as any, () => new HyperdriveClient(binding as Hyperdrive));
    } else if (this.isDispatchNamespace(binding)) {
      // Phase 7 — before isFetcher since dispatch namespaces have 'get' not 'fetch'
      this.app.container.singleton(key as any, () => new DispatchNamespaceClient(binding as DispatchNamespace));
    } else if (this.isFetcher(binding)) {
      // Phase 7 — must come last; most permissive positive guard (only requires 'fetch')
      this.app.container.singleton(key as any, () => new ServiceClient(binding as Fetcher));
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

  private isAi(obj: object): boolean {
    // Has `run` but not `prepare` (D1) or `batch` (D1/Queue)
    return 'run' in obj && !('prepare' in obj) && !('batch' in obj);
  }

  private isVectorize(obj: object): boolean {
    return 'query' in obj && 'insert' in obj && 'getByIds' in obj && 'deleteByIds' in obj;
  }

  // DurableObjectNamespace duck-typing uses 4 required methods — low collision
  // probability, but flag for future reviewers if a new CF binding adds all four.
  private isDurableObjectNamespace(obj: object): boolean {
    return 'idFromName' in obj && 'idFromString' in obj && 'newUniqueId' in obj && 'get' in obj;
  }

  private isHyperdrive(obj: object): boolean {
    return 'connectionString' in obj && 'host' in obj && 'port' in obj;
  }

  private isDispatchNamespace(obj: object): boolean {
    // DispatchNamespace: has get() but no put/delete/list (KV/R2), no prepare (D1),
    // no idFromName (DO), and no fetch on the namespace itself
    return (
      'get' in obj &&
      !('put' in obj) &&
      !('delete' in obj) &&
      !('list' in obj) &&
      !('prepare' in obj) &&
      !('idFromName' in obj) &&
      !('fetch' in obj)
    );
  }

  private isFetcher(obj: object): boolean {
    // Fetcher: has fetch, but NOT prepare/batch (D1), send (Queue),
    // get/put/delete/list (KV/R2), or idFromName (DO)
    return (
      'fetch' in obj &&
      !('prepare' in obj) &&
      !('batch' in obj) &&
      !('send' in obj) &&
      !('get' in obj) &&
      !('idFromName' in obj)
    );
  }
}
