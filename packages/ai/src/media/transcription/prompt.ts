import type { TimestampGranularity } from '../../providers/interface.js';

/**
 * Value object captured per Transcription attempt. Fake-mode assertions
 * inspect `.language`, `.isDiarized()`, `.hasGranularity('word')`, etc.
 */
export class TranscriptionPrompt {
  constructor(
    public readonly sourceKind: 'path' | 'storage' | 'upload' | 'string',
    public readonly mimeType: string,
    public readonly language: string | undefined,
    public readonly diarize: boolean,
    public readonly granularity: TimestampGranularity | undefined,
    public readonly temperature: number | undefined,
    public readonly contextPrompt: string | undefined,
    public readonly provider: string,
  ) {}

  /** Case-insensitive substring test on the supplied context prompt. */
  contains(needle: string): boolean {
    const hay = this.contextPrompt ?? '';
    return hay.toLowerCase().includes(needle.toLowerCase());
  }

  isDiarized(): boolean {
    return this.diarize;
  }

  hasGranularity(g: TimestampGranularity): boolean {
    return this.granularity === g;
  }
}

export class QueuedTranscriptionPrompt {
  constructor(
    public readonly handleId: string,
    public readonly options: Record<string, unknown> = {},
  ) {}
}
