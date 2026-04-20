import type { Lab } from '../enums.js';
import { StorableFile, detectMimeType, type StorableFileSource } from './storable-file.js';

export interface ImageDimensions {
  width: number;
  height: number;
}

export class Image extends StorableFile {
  private _alias?: string;
  private _quality?: number;
  private _dimensions?: ImageDimensions;

  protected constructor(source: StorableFileSource, name: string, mimeType: string) {
    super(source, name, mimeType);
  }

  /** Display name override — used by providers that surface a filename. */
  as(name: string): this {
    this._alias = name;
    return this;
  }

  override name(): string {
    return this._alias ?? this._name;
  }

  quality(q: number): this {
    this._quality = q;
    return this;
  }

  getQuality(): number | undefined {
    return this._quality;
  }

  dimensions(d: ImageDimensions): this {
    this._dimensions = d;
    return this;
  }

  getDimensions(): ImageDimensions | undefined {
    return this._dimensions;
  }

  static fromPath(path: string): Image {
    const filename = basename(path);
    return new Image({ kind: 'path', path }, filename, detectMimeType(filename, 'image/png'));
  }

  static fromStorage(key: string, opts: { disk?: string; mimeType?: string; name?: string } = {}): Image {
    const name = opts.name ?? basename(key);
    return new Image(
      { kind: 'storage', key, disk: opts.disk },
      name,
      opts.mimeType ?? detectMimeType(name, 'image/png'),
    );
  }

  static fromUrl(url: string, opts: { mimeType?: string; name?: string } = {}): Image {
    const name = opts.name ?? basename(url);
    return new Image({ kind: 'url', url }, name, opts.mimeType ?? detectMimeType(name, 'image/png'));
  }

  static fromUpload(file: Blob, opts: { mimeType?: string; name?: string } = {}): Image {
    const fileName = opts.name ?? (file instanceof File ? file.name : 'upload');
    return new Image(
      { kind: 'upload', file, filename: fileName },
      fileName,
      opts.mimeType ?? file.type ?? detectMimeType(fileName, 'image/png'),
    );
  }

  static fromString(content: string, mimeType: string, opts: { name?: string } = {}): Image {
    return new Image({ kind: 'string', content }, opts.name ?? 'image', mimeType);
  }

  static fromId(
    providerFileId: string,
    opts: { provider?: Lab | string; mimeType?: string; name?: string } = {},
  ): Image {
    return new Image(
      { kind: 'id', fileId: providerFileId, provider: opts.provider },
      opts.name ?? providerFileId,
      opts.mimeType ?? 'image/png',
    );
  }
}

function basename(pathOrUrl: string): string {
  const cleaned = pathOrUrl.split('?')[0]!.split('#')[0]!;
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || cleaned;
}
