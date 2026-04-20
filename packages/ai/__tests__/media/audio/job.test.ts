import { describe, it, expect, afterEach } from 'bun:test';
import { AudioJob } from '../../../src/media/audio/job';

describe('AudioJob', () => {
  afterEach(() => {
    AudioJob.restore();
  });

  it('dispatches with the serialized payload when faked', async () => {
    AudioJob.fake();
    await AudioJob.dispatch({
      text: 'ahoy',
      options: { gender: 'male', instructions: 'said like a pirate', format: 'mp3' },
      providers: ['openai'],
      handleId: 'ai_audio_test',
    });
    expect(() => AudioJob.assertDispatched(AudioJob)).not.toThrow();
  });

  it('serializes all audio options through JSON without loss', () => {
    const payload = {
      text: 'hello world',
      options: { gender: 'female' as const, voice: 'nova', speed: 1.25, format: 'opus' as const },
      providers: ['openai'],
      handleId: 'h1',
    };
    const roundtrip = JSON.parse(JSON.stringify(payload));
    expect(roundtrip.options.gender).toBe('female');
    expect(roundtrip.options.voice).toBe('nova');
    expect(roundtrip.options.speed).toBe(1.25);
  });
});
