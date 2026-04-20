import type { ImageResponse as ProviderImageResponse } from '../../providers/interface.js';
import { toBase64 } from '../../providers/attachment-encoding.js';
import {
  getMediaStorageResolver,
  generateStorageKey,
  MediaStorageUnavailableError,
} from '../shared/storage.js';
import { bytesToDataUrl, extensionForMime } from '../shared/mime.js';

/**
 * Result of `ImageBuilder.generate()`. Exposes raw bytes along with
 * convenience helpers — base64 stringification (Laravel's `(string) $image`
 * idiom), mime detection, data-URL rendering, and R2 storage.
 */
export class ImageResponse {
  readonly bytes: Uint8Array;
  readonly model: string;
  readonly provider: string;
  private readonly _mimeType: string;

  constructor(raw: ProviderImageResponse) {
    this.bytes = raw.bytes;
    this._mimeType = raw.mimeType;
    this.model = raw.model;
    this.provider = raw.provider;
  }

  /** Base64-encoded bytes — matches Laravel's `(string) $image` behaviour. */
  toString(): string {
    return this.asBase64();
  }

  asBase64(): string {
    return toBase64(this.bytes);
  }

  asDataUrl(): string {
    return bytesToDataUrl(this.bytes, this._mimeType);
  }

  mimeType(): string {
    return this._mimeType;
  }

  /** Write to R2 under a generated key. Returns the resolved key or URL. */
  async store(opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('ImageResponse.store()');
    const key = generateStorageKey('images', extensionForMime(this._mimeType));
    return resolver.put(key, this.bytes, { disk: opts.disk, mimeType: this._mimeType });
  }

  async storeAs(path: string, opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('ImageResponse.storeAs()');
    return resolver.put(path, this.bytes, { disk: opts.disk, mimeType: this._mimeType });
  }

  async storePublicly(opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('ImageResponse.storePublicly()');
    const key = generateStorageKey('images', extensionForMime(this._mimeType));
    await resolver.put(key, this.bytes, { disk: opts.disk, mimeType: this._mimeType, public: true });
    return resolver.publicUrl?.(key, { disk: opts.disk }) ?? key;
  }

  async storePubliclyAs(path: string, opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('ImageResponse.storePubliclyAs()');
    await resolver.put(path, this.bytes, { disk: opts.disk, mimeType: this._mimeType, public: true });
    return resolver.publicUrl?.(path, { disk: opts.disk }) ?? path;
  }
}
