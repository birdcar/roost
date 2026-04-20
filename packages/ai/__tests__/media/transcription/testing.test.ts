import { describe, it, expect, afterEach } from 'bun:test';
import { Transcription } from '../../../src/media/transcription';

const AUDIO = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

describe('Transcription testing surface', () => {
  afterEach(() => {
    Transcription.restore();
  });

  it('fake() accepts provider response objects and records prompts', async () => {
    Transcription.fake([
      { text: 'segment 1', model: 'whisper', provider: 'fake' },
      'segment 2',
    ]);
    const r1 = await Transcription.fromString(AUDIO, 'audio/wav').generate();
    const r2 = await Transcription.fromString(AUDIO, 'audio/wav').generate();
    expect(r1.text).toBe('segment 1');
    expect(r2.text).toBe('segment 2');
  });

  it('preventStrayTranscription throws on unmatched calls', async () => {
    Transcription.fake();
    Transcription.preventStrayTranscription();
    await expect(Transcription.fromString(AUDIO, 'audio/wav').generate()).rejects.toThrow();
  });

  it('TranscriptionPrompt helpers expose diarize and granularity', async () => {
    Transcription.fake(['x']);
    await Transcription.fromString(AUDIO, 'audio/wav').diarize().timestampGranularity('word').generate();
    Transcription.assertGenerated((p) => p.isDiarized() && p.hasGranularity('word'));
  });
});
