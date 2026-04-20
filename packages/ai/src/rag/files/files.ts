import { Image } from '../../attachments/image.js';
import { Document } from '../../attachments/document.js';
import { StorableFile } from '../../attachments/storable-file.js';
import type { FileRecord } from '../types.js';
import { FileStored, FileDeleted } from '../events.js';
import { dispatchEvent } from '../../events.js';
import { resolveFilesAdapter, type FilesAdapter } from './storage-providers.js';

export type FilePredicate = (file: StorableFile) => boolean;

export interface FilesStoreOptions {
  provider?: string;
  purpose?: string;
}

export class FilesFake {
  readonly stored: Array<{ file: StorableFile; record: FileRecord }> = [];
  readonly deleted: string[] = [];
  private records = new Map<string, FileRecord>();
  private counter = 0;

  async store(file: StorableFile, opts: FilesStoreOptions = {}): Promise<FileRecord> {
    const record: FileRecord = {
      id: `fake_file_${++this.counter}`,
      name: file.name(),
      mimeType: file.mimeType(),
      size: (await file.bytes()).byteLength,
      provider: opts.provider ?? 'fake',
      createdAt: Date.now(),
    };
    this.records.set(record.id, record);
    this.stored.push({ file, record });
    return record;
  }

  async get(id: string): Promise<FileRecord> {
    const record = this.records.get(id);
    if (!record) throw new Error(`FilesFake: file '${id}' not found`);
    return record;
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
    this.deleted.push(id);
  }
}

let fake: FilesFake | null = null;

/**
 * Static `Files` namespace. Extends the P4 `{Image, Document}` shape with
 * `.store/.get/.delete/.fake` and assertion helpers. Adapters are routed via
 * `rag/files/storage-providers.ts`.
 */
export const Files = {
  Image,
  Document,

  async store(file: StorableFile, opts: FilesStoreOptions = {}): Promise<FileRecord> {
    if (fake) return fake.store(file, opts);
    const adapter = resolveFilesAdapter(opts.provider);
    const record = await adapter.store(file, opts.purpose);
    await dispatchEvent(FileStored, new FileStored(record, adapter.provider));
    return record;
  },

  async get(id: string, opts: { provider?: string } = {}): Promise<FileRecord> {
    if (fake) return fake.get(id);
    return resolveFilesAdapter(opts.provider).get(id);
  },

  async delete(id: string, opts: { provider?: string } = {}): Promise<void> {
    if (fake) return fake.delete(id);
    const adapter = resolveFilesAdapter(opts.provider);
    await adapter.delete(id);
    await dispatchEvent(FileDeleted, new FileDeleted(id, adapter.provider));
  },

  fake(): FilesFake {
    fake = new FilesFake();
    return fake;
  },

  restore(): void {
    fake = null;
  },

  assertStored(predicate?: FilePredicate): void {
    const f = requireFake();
    if (f.stored.length === 0) throw new Error('Expected Files.store() to be called, but it was never called');
    if (predicate && !f.stored.some(({ file }) => predicate(file))) {
      throw new Error('Expected Files.store() to be called with a matching file, but no entry matched the predicate');
    }
  },

  assertDeleted(id: string): void {
    const f = requireFake();
    if (!f.deleted.includes(id)) {
      throw new Error(`Expected Files.delete('${id}') to be called, but the id was not deleted`);
    }
  },

  assertNothingStored(): void {
    const f = requireFake();
    if (f.stored.length > 0) {
      throw new Error(`Expected no files to be stored, but ${f.stored.length} were`);
    }
  },
};

function requireFake(): FilesFake {
  if (!fake) throw new Error('Files.fake() was not called');
  return fake;
}
