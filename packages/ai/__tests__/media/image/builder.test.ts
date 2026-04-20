import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Image } from '../../../src/media/image';
import type {
  AIProvider,
  ProviderCapabilities,
  ImageRequest,
  ImageResponse as ProviderImageResponse,
} from '../../../src/providers/interface';
import {
  setDefaultMediaProvider,
  resetMediaProviders,
} from '../../../src/media/shared/provider-resolver';

class FakeImageProvider implements AIProvider {
  readonly name = 'fake-image-provider';
  calls: ImageRequest[] = [];
  constructor(private response: ProviderImageResponse) {}
  capabilities(): ProviderCapabilities {
    return { name: this.name, supported: new Set(['image', 'chat']) };
  }
  async chat(): Promise<never> {
    throw new Error('not implemented');
  }
  async image(request: ImageRequest): Promise<ProviderImageResponse> {
    this.calls.push(request);
    return this.response;
  }
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe('ImageBuilder', () => {
  afterEach(() => {
    Image.restore();
    resetMediaProviders();
  });

  it('sends aspect, quality, and seed to the provider', async () => {
    const provider = new FakeImageProvider({
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      model: 'flux',
      provider: 'fake-image-provider',
    });
    setDefaultMediaProvider(provider);

    await Image.of('a red balloon').landscape().quality('high').seed(42).generate();

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.aspect).toBe('landscape');
    expect(provider.calls[0]!.quality).toBe('high');
    expect(provider.calls[0]!.seed).toBe(42);
    expect(provider.calls[0]!.prompt).toBe('a red balloon');
  });

  it('the last aspect mutator wins', async () => {
    const provider = new FakeImageProvider({
      bytes: PNG_BYTES, mimeType: 'image/png', model: 'flux', provider: 'fake-image-provider',
    });
    setDefaultMediaProvider(provider);
    await Image.of('cat').square().portrait().landscape().generate();
    expect(provider.calls[0]!.aspect).toBe('landscape');
  });

  it('throws when the requested provider lacks image support', async () => {
    const noImage: AIProvider = {
      name: 'chat-only',
      capabilities: () => ({ name: 'chat-only', supported: new Set(['chat']) }),
      chat: async () => ({ text: '', toolCalls: [] }),
    };
    setDefaultMediaProvider(noImage);
    await expect(Image.of('x').generate()).rejects.toThrow(/does not support capability 'image'/);
  });

  it('fake() records generated prompts with builder state', async () => {
    Image.fake();
    await Image.of('forest').portrait().quality('medium').generate();
    Image.assertGenerated((p) => p.contains('forest') && p.isPortrait() && p.hasQuality('medium'));
  });

  it('fake() rotates through a byte-array list', async () => {
    Image.fake([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
    const r1 = await Image.of('one').generate();
    const r2 = await Image.of('two').generate();
    expect(Array.from(r1.bytes)).toEqual([1, 2, 3]);
    expect(Array.from(r2.bytes)).toEqual([4, 5, 6]);
  });

  it('fake() invokes a closure resolver with the ImagePrompt', async () => {
    Image.fake((prompt) => {
      const label = new TextEncoder().encode(prompt.prompt);
      return label;
    });
    const response = await Image.of('hello').generate();
    expect(new TextDecoder().decode(response.bytes)).toBe('hello');
  });

  it('preventStrayImages throws when no response was queued', async () => {
    Image.fake().preventStrayImages();
    await expect(Image.of('unknown').generate()).rejects.toThrow(/Stray Image generation/);
  });

  it('assertNothingGenerated passes when no generate calls happened', () => {
    Image.fake();
    expect(() => Image.assertNothingGenerated()).not.toThrow();
  });

  it('assertNothingGenerated throws when a generate call was recorded', async () => {
    Image.fake();
    await Image.of('foo').generate();
    expect(() => Image.assertNothingGenerated()).toThrow();
  });
});

describe('Image.queue()', () => {
  beforeEach(() => {
    Image.restore();
  });
  afterEach(() => {
    Image.restore();
  });

  it('records queued prompts when faking', async () => {
    Image.fake();
    Image.of('async').queue();
    Image.assertQueued((p) => p.contains('async'));
  });

  it('assertNothingQueued throws after queueing', () => {
    Image.fake();
    Image.of('foo').queue();
    expect(() => Image.assertNothingQueued()).toThrow();
  });
});
