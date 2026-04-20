import { describe, it, expect, afterEach } from 'bun:test';
import { TranscriptionJob } from '../../../src/media/transcription/job';

describe('TranscriptionJob', () => {
  afterEach(() => {
    TranscriptionJob.restore();
  });

  it('dispatches with a string-kind audio ref when faked', async () => {
    TranscriptionJob.fake();
    await TranscriptionJob.dispatch({
      audioRef: { kind: 'string', base64: 'AAAA', mimeType: 'audio/wav' },
      options: { diarize: true, language: 'en' },
      providers: ['openai'],
      handleId: 'ai_transcription_test',
    });
    expect(() => TranscriptionJob.assertDispatched(TranscriptionJob)).not.toThrow();
  });

  it('serializes audio refs through JSON without loss', () => {
    const payload = {
      audioRef: { kind: 'storage' as const, key: 'uploads/a.wav', disk: 'r2', mimeType: 'audio/wav' },
      options: { diarize: true, language: 'en', prompt: 'vocabulary' },
      providers: ['openai'],
      handleId: 'abc',
    };
    const roundtrip = JSON.parse(JSON.stringify(payload));
    expect(roundtrip.audioRef.kind).toBe('storage');
    expect(roundtrip.audioRef.key).toBe('uploads/a.wav');
    expect(roundtrip.options.diarize).toBe(true);
  });
});
