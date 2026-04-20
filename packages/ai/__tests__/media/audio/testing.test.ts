import { describe, it, expect, afterEach } from 'bun:test';
import { Audio } from '../../../src/media/audio';

describe('Audio testing surface', () => {
  afterEach(() => {
    Audio.restore();
  });

  it('AudioPrompt exposes gender and format helpers', async () => {
    Audio.fake();
    await Audio.of('pirate line').male().format('mp3').generate();
    Audio.assertGenerated((p) => p.isMale() && p.hasFormat('mp3'));
  });

  it('assertNotGenerated with a predicate fails when matched', async () => {
    Audio.fake();
    await Audio.of('hi').female().generate();
    expect(() => Audio.assertNotGenerated((p) => p.isFemale())).toThrow();
  });

  it('preventStrayAudio() throws on unmatched calls', async () => {
    Audio.fake();
    Audio.preventStrayAudio();
    await expect(Audio.of('stray').generate()).rejects.toThrow();
  });
});
