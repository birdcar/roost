import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ImageResponse } from '../../../src/media/image/response';
import {
  setMediaStorageResolver,
  type MediaStorageResolver,
} from '../../../src/media/shared/storage';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);

describe('ImageResponse', () => {
  afterEach(() => {
    setMediaStorageResolver(null);
  });

  it('toString() returns base64 bytes', () => {
    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    const expected = Buffer.from(PNG_BYTES).toString('base64');
    expect(response.toString()).toBe(expected);
    expect(response.asBase64()).toBe(expected);
  });

  it('asDataUrl() returns a data: URI with the stored mime', () => {
    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    expect(response.asDataUrl()).toMatch(/^data:image\/png;base64,/);
  });

  it('store() writes through the media storage resolver and returns the key', async () => {
    const puts: Array<{ key: string; bytes: Uint8Array; mimeType?: string; public?: boolean }> = [];
    const resolver: MediaStorageResolver = {
      put: async (key, bytes, opts) => {
        puts.push({ key, bytes, ...opts });
        return key;
      },
    };
    setMediaStorageResolver(resolver);

    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    const key = await response.store();

    expect(key).toMatch(/^images\/[\w-]+\.png$/);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.bytes).toEqual(PNG_BYTES);
    expect(puts[0]!.mimeType).toBe('image/png');
  });

  it('storeAs() honours the provided path', async () => {
    const puts: string[] = [];
    setMediaStorageResolver({
      put: async (key) => {
        puts.push(key);
        return key;
      },
    });
    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    const key = await response.storeAs('photos/today.png');
    expect(key).toBe('photos/today.png');
    expect(puts).toEqual(['photos/today.png']);
  });

  it('storePublicly() returns the resolver-supplied URL when available', async () => {
    setMediaStorageResolver({
      put: async () => 'unused',
      publicUrl: (key) => `https://cdn.example.com/${key}`,
    });
    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    const url = await response.storePublicly();
    expect(url).toMatch(/^https:\/\/cdn\.example\.com\/images\//);
  });

  it('throws a descriptive error when no storage resolver is registered', async () => {
    setMediaStorageResolver(null);
    const response = new ImageResponse({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'test',
    });
    await expect(response.store()).rejects.toThrow(/Media storage is not configured/);
  });
});
