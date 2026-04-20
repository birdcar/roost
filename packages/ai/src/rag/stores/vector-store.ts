import type { VectorStore as CFVectorStore } from '@roostjs/cloudflare';
import { StorableFile } from '../../attachments/storable-file.js';
import type { EmbeddingPipeline } from '../embedding-pipeline.js';
import { Files } from '../files/files.js';
import { StoreNotFoundError, type StoreRecord } from '../types.js';
import { validateMetadata } from './metadata.js';
import {
  AddingFileToStore,
  FileAddedToStore,
  RemovingFileFromStore,
  FileRemovedFromStore,
} from '../events.js';
import { dispatchEvent } from '../../events.js';

export interface DocumentRecord {
  id: string;
  fileId: string;
  storeId: string;
  metadata?: Record<string, unknown>;
}

export interface VectorStoreHandleDeps {
  index: CFVectorStore;
  embeddings: EmbeddingPipeline;
  namespacePrefix: string;
}

export class VectorStoreHandle {
  readonly id: string;
  name: string;
  fileCounts: { total: number; ready: number };
  private readonly deps: VectorStoreHandleDeps;
  private readonly added = new Map<string, DocumentRecord>();

  constructor(record: StoreRecord, deps: VectorStoreHandleDeps) {
    this.id = record.id;
    this.name = record.name;
    this.fileCounts = record.fileCounts;
    this.deps = deps;
  }

  private namespace(): string {
    return `${this.deps.namespacePrefix}:${this.id}`;
  }

  async add(
    fileOrId: StorableFile | string,
    opts: { metadata?: Record<string, unknown> } = {},
  ): Promise<DocumentRecord> {
    let fileId: string;
    let content: string;

    if (typeof fileOrId === 'string') {
      fileId = fileOrId;
      content = fileId;
    } else {
      const record = await Files.store(fileOrId);
      fileId = record.id;
      content = new TextDecoder().decode(await fileOrId.bytes());
    }

    await dispatchEvent(AddingFileToStore, new AddingFileToStore(this.id, fileId));

    const validated = validateMetadata(opts.metadata) ?? {};
    const [embedding] = await this.deps.embeddings.embed([content]);
    if (!embedding) throw new Error('Embedding pipeline returned no vector');

    const vectorId = `${this.id}:${fileId}`;
    await this.deps.index.insert([
      {
        id: vectorId,
        values: embedding,
        namespace: this.namespace(),
        metadata: { ...validated, fileId, storeId: this.id },
      } as VectorizeVector,
    ]);

    const record: DocumentRecord = { id: vectorId, fileId, storeId: this.id, metadata: opts.metadata };
    this.added.set(fileId, record);
    this.fileCounts = { total: this.fileCounts.total + 1, ready: this.fileCounts.ready + 1 };

    await dispatchEvent(FileAddedToStore, new FileAddedToStore(this.id, fileId, opts.metadata));
    return record;
  }

  async remove(fileId: string, opts: { deleteFile?: boolean } = {}): Promise<void> {
    await dispatchEvent(RemovingFileFromStore, new RemovingFileFromStore(this.id, fileId));

    const vectorId = `${this.id}:${fileId}`;
    await this.deps.index.deleteByIds([vectorId]);
    this.added.delete(fileId);
    this.fileCounts = {
      total: Math.max(0, this.fileCounts.total - 1),
      ready: Math.max(0, this.fileCounts.ready - 1),
    };

    if (opts.deleteFile) {
      try {
        await Files.delete(fileId);
      } catch {
        // swallow — primary operation (vector removal) already succeeded
      }
    }

    await dispatchEvent(
      FileRemovedFromStore,
      new FileRemovedFromStore(this.id, fileId, !!opts.deleteFile),
    );
  }

  /** @internal — test helpers only, exposed for StoresFake wiring. */
  _recordedAdds(): DocumentRecord[] {
    return [...this.added.values()];
  }
}

export { StoreNotFoundError };
