import type { Lab } from '../enums.js';
import { StorableFile, detectMimeType, type StorableFileSource } from './storable-file.js';

export class Document extends StorableFile {
  private _pages?: number;

  protected constructor(source: StorableFileSource, name: string, mimeType: string) {
    super(source, name, mimeType);
  }

  /** Declare a known page count; Phase 4 does not inspect PDFs. */
  withPages(n: number): this {
    this._pages = n;
    return this;
  }

  pages(): number | undefined {
    return this._pages;
  }

  static fromPath(path: string): Document {
    const filename = basename(path);
    return new Document({ kind: 'path', path }, filename, detectMimeType(filename, 'application/pdf'));
  }

  static fromStorage(key: string, opts: { disk?: string; mimeType?: string; name?: string } = {}): Document {
    const name = opts.name ?? basename(key);
    return new Document(
      { kind: 'storage', key, disk: opts.disk },
      name,
      opts.mimeType ?? detectMimeType(name, 'application/pdf'),
    );
  }

  static fromUrl(url: string, opts: { mimeType?: string; name?: string } = {}): Document {
    const name = opts.name ?? basename(url);
    return new Document({ kind: 'url', url }, name, opts.mimeType ?? detectMimeType(name, 'application/pdf'));
  }

  static fromUpload(file: Blob, opts: { mimeType?: string; name?: string } = {}): Document {
    const fileName = opts.name ?? (file instanceof File ? file.name : 'upload');
    return new Document(
      { kind: 'upload', file, filename: fileName },
      fileName,
      opts.mimeType ?? file.type ?? detectMimeType(fileName, 'application/pdf'),
    );
  }

  static fromString(content: string, mimeType: string, opts: { name?: string } = {}): Document {
    return new Document({ kind: 'string', content }, opts.name ?? 'document', mimeType);
  }

  static fromId(
    providerFileId: string,
    opts: { provider?: Lab | string; mimeType?: string; name?: string } = {},
  ): Document {
    return new Document(
      { kind: 'id', fileId: providerFileId, provider: opts.provider },
      opts.name ?? providerFileId,
      opts.mimeType ?? 'application/pdf',
    );
  }
}

function basename(pathOrUrl: string): string {
  const cleaned = pathOrUrl.split('?')[0]!.split('#')[0]!;
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || cleaned;
}
