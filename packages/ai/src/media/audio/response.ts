import type {
  AudioFormat,
  AudioResponse as ProviderAudioResponse,
} from '../../providers/interface.js';
import { toBase64 } from '../../providers/attachment-encoding.js';
import {
  getMediaStorageResolver,
  generateStorageKey,
  MediaStorageUnavailableError,
} from '../shared/storage.js';
import { bytesToDataUrl, extensionForMime } from '../shared/mime.js';

export class AudioResponse {
  readonly bytes: Uint8Array;
  readonly model: string;
  readonly provider: string;
  private readonly _format: AudioFormat;
  private readonly _mimeType: string;

  constructor(raw: ProviderAudioResponse) {
    this.bytes = raw.bytes;
    this._format = raw.format;
    this._mimeType = raw.mimeType;
    this.model = raw.model;
    this.provider = raw.provider;
  }

  toString(): string {
    return this.asBase64();
  }

  asBase64(): string {
    return toBase64(this.bytes);
  }

  asDataUrl(): string {
    return bytesToDataUrl(this.bytes, this._mimeType);
  }

  format(): AudioFormat {
    return this._format;
  }

  mimeType(): string {
    return this._mimeType;
  }

  async store(opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('AudioResponse.store()');
    const key = generateStorageKey('audio', extensionForMime(this._mimeType));
    return resolver.put(key, this.bytes, { disk: opts.disk, mimeType: this._mimeType });
  }

  async storeAs(path: string, opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('AudioResponse.storeAs()');
    return resolver.put(path, this.bytes, { disk: opts.disk, mimeType: this._mimeType });
  }

  async storePublicly(opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('AudioResponse.storePublicly()');
    const key = generateStorageKey('audio', extensionForMime(this._mimeType));
    await resolver.put(key, this.bytes, { disk: opts.disk, mimeType: this._mimeType, public: true });
    return resolver.publicUrl?.(key, { disk: opts.disk }) ?? key;
  }

  async storePubliclyAs(path: string, opts: { disk?: string } = {}): Promise<string> {
    const resolver = getMediaStorageResolver();
    if (!resolver) throw new MediaStorageUnavailableError('AudioResponse.storePubliclyAs()');
    await resolver.put(path, this.bytes, { disk: opts.disk, mimeType: this._mimeType, public: true });
    return resolver.publicUrl?.(path, { disk: opts.disk }) ?? path;
  }
}
