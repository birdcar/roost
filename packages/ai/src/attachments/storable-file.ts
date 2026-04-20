import type { Lab } from '../enums.js';

export class AttachmentTooLargeError extends Error {
  override readonly name = 'AttachmentTooLargeError';
  constructor(filename: string, size: number, limit: number) {
    super(`Attachment '${filename}' is ${size} bytes; exceeds the ${limit}-byte limit for the selected provider.`);
  }
}

export class FileNotFoundError extends Error {
  override readonly name = 'FileNotFoundError';
  constructor(reference: string) {
    super(`Attachment file not found: ${reference}`);
  }
}

export interface FileRecord {
  id: string;
  provider?: Lab | string;
  size?: number;
  mimeType?: string;
}

export interface StorageResolver {
  get(key: string, opts?: { disk?: string }): Promise<{ bytes: Uint8Array; mimeType?: string } | null>;
}

let storageResolver: StorageResolver | null = null;

/**
 * Register a storage resolver that `StorableFile.fromStorage` will use to
 * hydrate bytes at send time. Wired by the host application (typically via
 * `AiServiceProvider`) since the attachments package is runtime-agnostic.
 */
export function setStorageResolver(resolver: StorageResolver | null): void {
  storageResolver = resolver;
}

export function getStorageResolver(): StorageResolver | null {
  return storageResolver;
}

type Source =
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'string'; content: string }
  | { kind: 'url'; url: string }
  | { kind: 'storage'; key: string; disk?: string }
  | { kind: 'path'; path: string }
  | { kind: 'upload'; file: Blob; filename?: string }
  | { kind: 'id'; fileId: string; provider?: Lab | string };

export abstract class StorableFile {
  protected _name: string;
  protected _mimeType: string;
  protected readonly source: Source;
  protected _providerFileId?: string;
  protected _providerLab?: Lab | string;
  protected _cachedBytes?: Uint8Array;

  protected constructor(source: Source, name: string, mimeType: string) {
    this.source = source;
    this._name = name;
    this._mimeType = mimeType;
    if (source.kind === 'id') {
      this._providerFileId = source.fileId;
      this._providerLab = source.provider;
    }
  }

  name(): string {
    return this._name;
  }

  mimeType(): string {
    return this._mimeType;
  }

  /** Return the pre-uploaded provider file ID if this attachment was created via `fromId`. */
  providerFileId(): string | undefined {
    return this._providerFileId;
  }

  providerLab(): Lab | string | undefined {
    return this._providerLab;
  }

  async size(): Promise<number> {
    const bytes = await this.bytes();
    return bytes.byteLength;
  }

  async bytes(): Promise<Uint8Array> {
    if (this._cachedBytes) return this._cachedBytes;
    const bytes = await this.loadBytes();
    this._cachedBytes = bytes;
    return bytes;
  }

  private async loadBytes(): Promise<Uint8Array> {
    switch (this.source.kind) {
      case 'bytes':
        return this.source.bytes;
      case 'string':
        return new TextEncoder().encode(this.source.content);
      case 'url': {
        const response = await fetch(this.source.url);
        if (!response.ok) throw new FileNotFoundError(this.source.url);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      }
      case 'storage': {
        const resolver = getStorageResolver();
        if (!resolver) {
          throw new Error(
            "Attachment 'fromStorage' used but no storage resolver is registered. Call setStorageResolver() during app boot.",
          );
        }
        const record = await resolver.get(this.source.key, { disk: this.source.disk });
        if (!record) throw new FileNotFoundError(this.source.key);
        if (record.mimeType) this._mimeType = record.mimeType;
        return record.bytes;
      }
      case 'path': {
        const fs = await import('node:fs/promises').catch(() => null);
        if (!fs) {
          throw new Error(
            `Attachment 'fromPath' is only available under Node/Bun. Use 'fromStorage' or 'fromUpload' under Cloudflare Workers.`,
          );
        }
        const buffer = await fs.readFile(this.source.path);
        return new Uint8Array(buffer);
      }
      case 'upload': {
        const buffer = await this.source.file.arrayBuffer();
        return new Uint8Array(buffer);
      }
      case 'id':
        throw new Error(
          `StorableFile.bytes() called on an 'fromId' attachment. Provider file-id references don't carry bytes client-side — pass the attachment directly to the provider.`,
        );
    }
  }

  /**
   * Upload to the selected provider's Files API. Phase 5 ships concrete
   * implementations. Phase 4 throws to signal the capability is not yet wired.
   */
  async put(_opts?: { provider?: Lab | string }): Promise<FileRecord> {
    throw new Error("StorableFile.put() requires provider Files API (ships in Phase 5).");
  }

  async get(): Promise<FileRecord> {
    if (!this._providerFileId) {
      throw new Error("StorableFile.get() requires a provider file ID — construct with fromId() or call put() first.");
    }
    return { id: this._providerFileId, provider: this._providerLab };
  }

  async delete(): Promise<void> {
    throw new Error("StorableFile.delete() requires provider Files API (ships in Phase 5).");
  }
}

export function detectMimeType(filename: string, fallback = 'application/octet-stream'): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] ?? fallback;
}

export interface StorableFileFactoryInputs {
  fromPath(path: string): StorableFile;
  fromStorage(key: string, opts?: { disk?: string; mimeType?: string; name?: string }): StorableFile;
  fromUrl(url: string, opts?: { mimeType?: string; name?: string }): StorableFile;
  fromUpload(file: Blob, opts?: { mimeType?: string; name?: string }): StorableFile;
  fromString(content: string, mimeType: string, opts?: { name?: string }): StorableFile;
  fromId(providerFileId: string, opts?: { provider?: Lab | string; mimeType?: string; name?: string }): StorableFile;
}

export { type Source as StorableFileSource };
