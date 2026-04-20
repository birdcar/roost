import { describe, it, expect } from 'bun:test';
import { TranscriptionResponse } from '../../../src/media/transcription/response';

describe('TranscriptionResponse', () => {
  it('toString() returns the transcription text', () => {
    const response = new TranscriptionResponse({
      text: 'hello there',
      model: 'whisper-1',
      provider: 'test',
    });
    expect(response.toString()).toBe('hello there');
  });

  it('populates segments and diarizedSegments when provided', () => {
    const response = new TranscriptionResponse({
      text: 'line 1. line 2.',
      segments: [{ start: 0, end: 1, text: 'line 1.' }],
      diarizedSegments: [{ start: 0, end: 1, text: 'line 1.', speaker: 'A' }],
      language: 'en',
      duration: 2.5,
      model: 'whisper-1',
      provider: 'test',
    });
    expect(response.segments).toHaveLength(1);
    expect(response.diarizedSegments[0]!.speaker).toBe('A');
    expect(response.language).toBe('en');
    expect(response.duration).toBe(2.5);
  });

  it('defaults segments arrays to empty when omitted', () => {
    const response = new TranscriptionResponse({
      text: 'x',
      model: 'whisper-1',
      provider: 'test',
    });
    expect(response.segments).toEqual([]);
    expect(response.diarizedSegments).toEqual([]);
  });
});
