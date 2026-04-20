import type { VectorStore as CFVectorStore } from '@roostjs/cloudflare';
import type { EmbeddingPipeline } from '../embedding-pipeline.js';
import type { StoreRecord } from '../types.js';
import { StoreNotFoundError } from '../types.js';
import { CreatingStore, StoreCreated } from '../events.js';
import { dispatchEvent } from '../../events.js';
import { VectorStoreHandle, type DocumentRecord } from './vector-store.js';
import { StorableFile } from '../../attachments/storable-file.js';

export interface StoresConfig {
  index: CFVectorStore;
  embeddings: EmbeddingPipeline;
  namespacePrefix: string;
}

let config: StoresConfig | null = null;

export function configureStores(cfg: StoresConfig | null): void {
  config = cfg;
}

export function getStoresConfig(): StoresConfig {
  if (!config) {
    throw new Error(
      'Stores not configured. Call configureStores({index, embeddings, namespacePrefix}) during app boot.',
    );
  }
  return config;
}

export interface StoresCreateOptions {
  description?: string;
  expiresWhenIdleFor?: number;
  provider?: string;
}

export class StoresFake {
  readonly created: StoreRecord[] = [];
  readonly deleted: string[] = [];
  readonly addedByStore = new Map<string, Array<{ file: StorableFile | string; metadata?: Record<string, unknown> }>>();
  readonly removedByStore = new Map<string, Array<{ fileId: string; deleteFile: boolean }>>();
  private handles = new Map<string, FakeVectorStoreHandle>();
  private counter = 0;

  create(name: string, opts: StoresCreateOptions = {}): FakeVectorStoreHandle {
    const record: StoreRecord = {
      id: `vs_fake_${++this.counter}`,
      name,
      description: opts.description,
      fileCounts: { total: 0, ready: 0 },
      provider: opts.provider ?? 'fake',
      createdAt: Date.now(),
    };
    this.created.push(record);
    const handle = new FakeVectorStoreHandle(record, this);
    this.handles.set(record.id, handle);
    return handle;
  }

  get(id: string): FakeVectorStoreHandle {
    const handle = this.handles.get(id);
    if (!handle) throw new StoreNotFoundError(id, 'fake');
    return handle;
  }

  delete(id: string): void {
    this.deleted.push(id);
    this.handles.delete(id);
  }
}

let fake: StoresFake | null = null;

export class FakeVectorStoreHandle {
  readonly id: string;
  name: string;
  fileCounts: { total: number; ready: number };
  private readonly owner: StoresFake;

  constructor(record: StoreRecord, owner: StoresFake) {
    this.id = record.id;
    this.name = record.name;
    this.fileCounts = record.fileCounts;
    this.owner = owner;
  }

  async add(
    fileOrId: StorableFile | string,
    opts: { metadata?: Record<string, unknown> } = {},
  ): Promise<DocumentRecord> {
    const fileId = typeof fileOrId === 'string' ? fileOrId : `fake_file_${this.id}_${this.fileCounts.total + 1}`;
    const list = this.owner.addedByStore.get(this.id) ?? [];
    list.push({ file: fileOrId, metadata: opts.metadata });
    this.owner.addedByStore.set(this.id, list);
    this.fileCounts = { total: this.fileCounts.total + 1, ready: this.fileCounts.ready + 1 };
    return { id: `${this.id}:${fileId}`, fileId, storeId: this.id, metadata: opts.metadata };
  }

  async remove(fileId: string, opts: { deleteFile?: boolean } = {}): Promise<void> {
    const list = this.owner.removedByStore.get(this.id) ?? [];
    list.push({ fileId, deleteFile: !!opts.deleteFile });
    this.owner.removedByStore.set(this.id, list);
    this.fileCounts = {
      total: Math.max(0, this.fileCounts.total - 1),
      ready: Math.max(0, this.fileCounts.ready - 1),
    };
  }

  assertAdded(idOrPredicate: string | ((file: StorableFile | string) => boolean)): void {
    const list = this.owner.addedByStore.get(this.id) ?? [];
    if (list.length === 0) throw new Error(`Expected a file to be added to store '${this.id}', but none were`);
    const matches = typeof idOrPredicate === 'string'
      ? list.some(({ file }) => file === idOrPredicate)
      : list.some(({ file }) => idOrPredicate(file));
    if (!matches) throw new Error(`Expected store '${this.id}' to match add assertion, but no file matched`);
  }

  assertRemoved(fileId: string): void {
    const list = this.owner.removedByStore.get(this.id) ?? [];
    if (!list.some((r) => r.fileId === fileId)) {
      throw new Error(`Expected store '${this.id}' to have removed '${fileId}'`);
    }
  }

  assertNotAdded(fileId: string): void {
    const list = this.owner.addedByStore.get(this.id) ?? [];
    if (list.some(({ file }) => file === fileId)) {
      throw new Error(`Expected store '${this.id}' NOT to have added '${fileId}'`);
    }
  }

  assertNotRemoved(fileId: string): void {
    const list = this.owner.removedByStore.get(this.id) ?? [];
    if (list.some((r) => r.fileId === fileId)) {
      throw new Error(`Expected store '${this.id}' NOT to have removed '${fileId}'`);
    }
  }
}

export const Stores = {
  async create(name: string, opts: StoresCreateOptions = {}): Promise<VectorStoreHandle | FakeVectorStoreHandle> {
    if (fake) return fake.create(name, opts);
    await dispatchEvent(CreatingStore, new CreatingStore(name, opts.description));
    const cfg = getStoresConfig();
    const record: StoreRecord = {
      id: slugify(name),
      name,
      description: opts.description,
      fileCounts: { total: 0, ready: 0 },
      provider: opts.provider ?? 'vectorize',
      createdAt: Date.now(),
    };
    await dispatchEvent(StoreCreated, new StoreCreated(record));
    return new VectorStoreHandle(record, cfg);
  },

  async get(id: string, _opts: { provider?: string } = {}): Promise<VectorStoreHandle | FakeVectorStoreHandle> {
    if (fake) return fake.get(id);
    const cfg = getStoresConfig();
    const record: StoreRecord = { id, name: id, fileCounts: { total: 0, ready: 0 }, provider: 'vectorize' };
    return new VectorStoreHandle(record, cfg);
  },

  async delete(id: string): Promise<void> {
    if (fake) {
      fake.delete(id);
      return;
    }
    const cfg = getStoresConfig();
    const namespace = `${cfg.namespacePrefix}:${id}`;
    // Vectorize doesn't expose a namespace-level delete; best-effort: consumers
    // that want physical cleanup can run a periodic scan. Surfacing a no-op
    // here matches the Laravel API shape without fabricating data.
    void namespace;
  },

  fake(): StoresFake {
    fake = new StoresFake();
    return fake;
  },

  restore(): void {
    fake = null;
  },

  assertCreated(matcher: string | ((name: string, desc?: string) => boolean)): void {
    const f = requireFake();
    const hit = typeof matcher === 'string'
      ? f.created.some((r) => r.name === matcher)
      : f.created.some((r) => matcher(r.name, r.description));
    if (!hit) throw new Error(`Expected Stores.create(${JSON.stringify(matcher)}) to be called`);
  },

  assertDeleted(id: string): void {
    const f = requireFake();
    if (!f.deleted.includes(id)) throw new Error(`Expected Stores.delete('${id}') to be called`);
  },

  assertNothingCreated(): void {
    const f = requireFake();
    if (f.created.length > 0) throw new Error(`Expected no stores to be created, but ${f.created.length} were`);
  },
};

function requireFake(): StoresFake {
  if (!fake) throw new Error('Stores.fake() was not called');
  return fake;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || `store_${Date.now()}`;
}

export { VectorStoreHandle } from './vector-store.js';
export type { DocumentRecord } from './vector-store.js';
