import { describe, it, expect, afterEach } from 'bun:test';
import { AudioResponse } from '../../../src/media/audio/response';
import { setMediaStorageResolver } from '../../../src/media/shared/storage';

const OPUS_BYTES = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]);

describe('AudioResponse', () => {
  afterEach(() => {
    setMediaStorageResolver(null);
  });

  it('reports format() and mimeType()', () => {
    const response = new AudioResponse({
      bytes: OPUS_BYTES, format: 'opus', mimeType: 'audio/opus', model: 'tts-1', provider: 'test',
    });
    expect(response.format()).toBe('opus');
    expect(response.mimeType()).toBe('audio/opus');
  });

  it('store() persists bytes through the resolver', async () => {
    const puts: Array<{ key: string; mimeType?: string }> = [];
    setMediaStorageResolver({
      put: async (key, _bytes, opts) => {
        puts.push({ key, mimeType: opts.mimeType });
        return key;
      },
    });
    const response = new AudioResponse({
      bytes: OPUS_BYTES, format: 'opus', mimeType: 'audio/opus', model: 'tts-1', provider: 'test',
    });
    const key = await response.store();
    expect(key).toMatch(/^audio\/[\w-]+\.opus$/);
    expect(puts[0]!.mimeType).toBe('audio/opus');
  });

  it('storePubliclyAs() returns the resolver-supplied URL when available', async () => {
    setMediaStorageResolver({
      put: async () => 'unused',
      publicUrl: (key) => `https://cdn.example.com/${key}`,
    });
    const response = new AudioResponse({
      bytes: OPUS_BYTES, format: 'opus', mimeType: 'audio/opus', model: 'tts-1', provider: 'test',
    });
    const url = await response.storePubliclyAs('voice/welcome.opus');
    expect(url).toBe('https://cdn.example.com/voice/welcome.opus');
  });
});
