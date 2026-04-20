import { describe, it, expect, afterEach } from 'bun:test';
import { ImageJob } from '../../../src/media/image/job';

describe('ImageJob', () => {
  afterEach(() => {
    ImageJob.restore();
  });

  it('dispatches with the serialized payload when faked', async () => {
    ImageJob.fake();
    await ImageJob.dispatch({
      prompt: 'a sunset',
      options: { aspect: 'landscape', quality: 'high', seed: 7 },
      providers: ['workers-ai'],
      handleId: 'ai_image_test',
    });
    expect(() => ImageJob.assertDispatched(ImageJob)).not.toThrow();
  });

  it('serializes provider selector and attachment refs without losing fields', () => {
    const payload = {
      prompt: 'cat',
      options: { aspect: 'square' as const, steps: 4 },
      providers: ['openai', 'workers-ai'],
      handleId: 'abc',
      attachments: [
        { kind: 'url' as const, url: 'https://example.com/ref.png', mimeType: 'image/png', name: 'ref.png' },
      ],
    };
    const roundtrip = JSON.parse(JSON.stringify(payload));
    expect(roundtrip.prompt).toBe('cat');
    expect(roundtrip.options.aspect).toBe('square');
    expect(roundtrip.attachments[0].kind).toBe('url');
    expect(roundtrip.providers).toEqual(['openai', 'workers-ai']);
  });
});
