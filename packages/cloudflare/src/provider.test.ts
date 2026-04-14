import { describe, it, expect } from 'bun:test';
import { CloudflareServiceProvider } from './provider.js';
import { KVStore } from './bindings/kv.js';
import { R2Storage } from './bindings/r2.js';
import { D1Database } from './bindings/d1.js';
import { QueueSender } from './bindings/queues.js';
import { AIClient } from './bindings/ai.js';
import { VectorStore } from './bindings/vectorize.js';
import { DurableObjectClient } from './bindings/durable-objects.js';
import { HyperdriveClient } from './bindings/hyperdrive.js';

// Minimal Application stub for testing the provider in isolation
function makeApp(env: Record<string, unknown>) {
  const registrations = new Map<unknown, () => unknown>();

  return {
    env,
    config: {
      get: () => { throw new Error('not used in register()'); },
      has: () => false,
    },
    container: {
      singleton(key: unknown, factory: () => unknown) {
        registrations.set(key, factory);
      },
      resolve(key: unknown) {
        const factory = registrations.get(key);
        if (!factory) throw new Error(`Not registered: ${String(key)}`);
        return factory();
      },
    },
    _registrations: registrations,
  };
}

function register(env: Record<string, unknown>) {
  const app = makeApp(env);
  const provider = new CloudflareServiceProvider(app as any);
  provider.register();
  return app;
}

// ─── KV ──────────────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — KV detection', () => {
  const kvBinding = { get: () => {}, put: () => {}, delete: () => {}, list: () => {} };

  it('wraps KV binding in KVStore', () => {
    const app = register({ KV: kvBinding });
    expect(app.container.resolve('KV')).toBeInstanceOf(KVStore);
  });
});

// ─── R2 ──────────────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — R2 detection', () => {
  const r2Binding = { head: () => {}, get: () => {}, put: () => {}, delete: () => {}, list: () => {} };

  it('wraps R2 binding in R2Storage', () => {
    const app = register({ BUCKET: r2Binding });
    expect(app.container.resolve('BUCKET')).toBeInstanceOf(R2Storage);
  });
});

// ─── D1 ──────────────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — D1 detection', () => {
  const d1Binding = { prepare: () => {}, batch: () => {}, exec: () => {}, dump: () => {} };

  it('wraps D1 binding in D1Database', () => {
    const app = register({ DB: d1Binding });
    expect(app.container.resolve('DB')).toBeInstanceOf(D1Database);
  });
});

// ─── Queue ───────────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — Queue detection', () => {
  const queueBinding = { send: () => {}, sendBatch: () => {} };

  it('wraps Queue binding in QueueSender', () => {
    const app = register({ QUEUE: queueBinding });
    expect(app.container.resolve('QUEUE')).toBeInstanceOf(QueueSender);
  });
});

// ─── AI ──────────────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — AI detection', () => {
  const aiBinding = { run: () => {} };
  const notAiBinding = { run: () => {}, prepare: () => {} }; // has prepare (D1-like)

  it('wraps AI binding in AIClient', () => {
    const app = register({ AI: aiBinding });
    expect(app.container.resolve('AI')).toBeInstanceOf(AIClient);
  });

  it('does NOT detect binding with run + prepare as AI', () => {
    const app = register({ FAKE_AI: notAiBinding });
    // D1 check fires first (has prepare+batch required), but this binding has no batch/exec/dump
    // so it falls through to AI — but the isAi guard excludes prepare. Should be unregistered.
    expect(() => app.container.resolve('FAKE_AI')).toThrow();
  });

  it('does NOT detect binding with run + batch as AI', () => {
    const app = register({ FAKE_AI2: { run: () => {}, batch: () => {} } });
    expect(() => app.container.resolve('FAKE_AI2')).toThrow();
  });
});

// ─── Vectorize ───────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — Vectorize detection', () => {
  const vectorBinding = {
    query: () => {},
    insert: () => {},
    getByIds: () => {},
    deleteByIds: () => {},
  };

  it('wraps Vectorize binding in VectorStore', () => {
    const app = register({ VECTORIZE: vectorBinding });
    expect(app.container.resolve('VECTORIZE')).toBeInstanceOf(VectorStore);
  });

  it('does NOT detect binding missing getByIds as Vectorize', () => {
    const app = register({ FAKE_VEC: { query: () => {}, insert: () => {} } });
    expect(() => app.container.resolve('FAKE_VEC')).toThrow();
  });
});

// ─── DurableObjects ──────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — DurableObjectNamespace detection', () => {
  const doBinding = {
    idFromName: () => {},
    idFromString: () => {},
    newUniqueId: () => {},
    get: () => {},
  };

  it('wraps DurableObjectNamespace binding in DurableObjectClient', () => {
    const app = register({ DO: doBinding });
    expect(app.container.resolve('DO')).toBeInstanceOf(DurableObjectClient);
  });

  it('does NOT detect binding missing idFromString as DurableObjectNamespace', () => {
    const app = register({ FAKE_DO: { idFromName: () => {}, get: () => {} } });
    expect(() => app.container.resolve('FAKE_DO')).toThrow();
  });
});

// ─── Hyperdrive ───────────────────────────────────────────────────────────────

describe('CloudflareServiceProvider — Hyperdrive detection', () => {
  const hyperdriveBinding = {
    connectionString: 'postgres://...',
    host: 'localhost',
    port: 5432,
    user: 'user',
    password: 'pass',
    database: 'db',
  };

  it('wraps Hyperdrive binding in HyperdriveClient', () => {
    const app = register({ DB_HYPERDRIVE: hyperdriveBinding });
    expect(app.container.resolve('DB_HYPERDRIVE')).toBeInstanceOf(HyperdriveClient);
  });

  it('does NOT detect binding with only connectionString (missing host/port) as Hyperdrive', () => {
    const app = register({ FAKE_HD: { connectionString: 'postgres://...' } });
    expect(() => app.container.resolve('FAKE_HD')).toThrow();
  });
});
