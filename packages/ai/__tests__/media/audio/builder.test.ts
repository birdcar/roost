import { describe, it, expect, afterEach } from 'bun:test';
import { Audio } from '../../../src/media/audio';
import type {
  AIProvider,
  ProviderCapabilities,
  AudioRequest,
  AudioResponse as ProviderAudioResponse,
} from '../../../src/providers/interface';
import {
  setDefaultMediaProvider,
  resetMediaProviders,
} from '../../../src/media/shared/provider-resolver';

class FakeAudioProvider implements AIProvider {
  readonly name = 'fake-audio-provider';
  calls: AudioRequest[] = [];
  constructor(private response: ProviderAudioResponse) {}
  capabilities(): ProviderCapabilities {
    return { name: this.name, supported: new Set(['audio', 'chat']) };
  }
  async chat(): Promise<never> { throw new Error('not implemented'); }
  async audio(request: AudioRequest): Promise<ProviderAudioResponse> {
    this.calls.push(request);
    return this.response;
  }
}

const MP3_BYTES = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

describe('AudioBuilder', () => {
  afterEach(() => {
    Audio.restore();
    resetMediaProviders();
  });

  it('resolves female() to gender hint without overriding an explicit voice', async () => {
    const provider = new FakeAudioProvider({
      bytes: MP3_BYTES, format: 'mp3', mimeType: 'audio/mpeg', model: 'tts-1', provider: 'fake-audio-provider',
    });
    setDefaultMediaProvider(provider);

    await Audio.of('hello').female().voice('nova').generate();
    expect(provider.calls[0]!.gender).toBe('female');
    expect(provider.calls[0]!.voice).toBe('nova');
  });

  it('forwards instructions and speed when set', async () => {
    const provider = new FakeAudioProvider({
      bytes: MP3_BYTES, format: 'mp3', mimeType: 'audio/mpeg', model: 'tts-1', provider: 'fake-audio-provider',
    });
    setDefaultMediaProvider(provider);
    await Audio.of('ahoy!').male().instructions('said like a pirate').speed(0.8).format('opus').generate();

    expect(provider.calls[0]!.instructions).toBe('said like a pirate');
    expect(provider.calls[0]!.speed).toBe(0.8);
    expect(provider.calls[0]!.format).toBe('opus');
    expect(provider.calls[0]!.gender).toBe('male');
  });

  it('rejects a speed outside the supported range', () => {
    expect(() => Audio.of('x').speed(5)).toThrow(/multiplier in \[0\.25, 4\]/);
  });

  it('accepts a Stringable input and stores its toString()', async () => {
    Audio.fake();
    const thing = { toString: () => 'coerced text' };
    await Audio.of(thing).generate();
    Audio.assertGenerated((p) => p.contains('coerced text'));
  });

  it('fake() records prompts and rotates through byte responses', async () => {
    Audio.fake([new Uint8Array([1]), new Uint8Array([2])]);
    const r1 = await Audio.of('one').generate();
    const r2 = await Audio.of('two').generate();
    expect(Array.from(r1.bytes)).toEqual([1]);
    expect(Array.from(r2.bytes)).toEqual([2]);
  });

  it('preventStrayAudio throws when no resolver matches', async () => {
    Audio.fake().preventStrayAudio();
    await expect(Audio.of('x').generate()).rejects.toThrow(/Stray Audio generation/);
  });
});

describe('Audio.queue()', () => {
  afterEach(() => {
    Audio.restore();
  });

  it('records queued audio when faking', async () => {
    Audio.fake();
    Audio.of('queued').queue();
    Audio.assertQueued((p) => p.contains('queued'));
  });
});
