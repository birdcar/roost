import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { Miniflare } from 'miniflare';
import { R2Storage } from '@roostjs/cloudflare';
import { Image } from '../../src/media/image';
import { Audio } from '../../src/media/audio';
import { Transcription } from '../../src/media/transcription';
import {
  setMediaStorageResolver,
  type MediaStorageResolver,
} from '../../src/media/shared/storage';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

let miniflare: Miniflare;
let bucket: R2Bucket;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } }',
    r2Buckets: ['MEDIA_BUCKET'],
  });
  bucket = await miniflare.getR2Bucket('MEDIA_BUCKET');
});

afterAll(async () => {
  await miniflare.dispose();
});

afterEach(() => {
  setMediaStorageResolver(null);
  Image.restore();
  Audio.restore();
  Transcription.restore();
});

describe('media miniflare integration', () => {
  it('stores faked image bytes to R2 via the storage resolver and retrieves them', async () => {
    const storage = new R2Storage(bucket);
    const resolver: MediaStorageResolver = {
      put: async (key, bytes, opts) => {
        await storage.put(key, bytes.buffer as ArrayBuffer, {
          httpMetadata: opts.mimeType ? { contentType: opts.mimeType } : undefined,
        });
        return key;
      },
      publicUrl: (key) => `https://media.example.com/${key}`,
    };
    setMediaStorageResolver(resolver);

    Image.fake([PNG_BYTES]);
    const response = await Image.of('sunset over a field').landscape().generate();
    const key = await response.storeAs('images/sunset.png');

    expect(key).toBe('images/sunset.png');
    const roundtrip = await storage.get('images/sunset.png');
    expect(roundtrip).not.toBeNull();
    const bytes = new Uint8Array(await roundtrip!.arrayBuffer());
    expect(bytes).toEqual(PNG_BYTES);
  });

  it('round-trips Audio.queue() via .then() callback', async () => {
    Audio.fake([new Uint8Array([0xff, 0xfb, 0x90, 0x00])]);
    Audio.of('queued audio').female().queue();
    Audio.assertQueued((p) => p.contains('queued audio'));
  });

  it('reads an upload blob through Transcription.fromUpload', async () => {
    Transcription.fake([
      { text: 'transcribed', language: 'en', model: 'whisper', provider: 'fake' },
    ]);
    const blob = new Blob([new Uint8Array([0x49, 0x44, 0x33, 0x04])], { type: 'audio/mpeg' });
    const response = await Transcription.fromUpload(blob).generate();
    expect(response.text).toBe('transcribed');
    expect(response.language).toBe('en');
  });
});
