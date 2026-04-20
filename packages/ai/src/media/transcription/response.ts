import type {
  TranscribeResponse as ProviderTranscribeResponse,
  TranscriptionSegment,
  DiarizedSegment,
} from '../../providers/interface.js';

/**
 * `TranscriptionResponse` diverges from Image/Audio — the result is text, not
 * bytes, so there are no `.store*()` helpers. Users persist transcriptions via
 * ordinary DB writes.
 */
export class TranscriptionResponse {
  readonly text: string;
  readonly segments: TranscriptionSegment[];
  readonly diarizedSegments: DiarizedSegment[];
  readonly language: string | undefined;
  readonly duration: number | undefined;
  readonly model: string;
  readonly provider: string;

  constructor(raw: ProviderTranscribeResponse) {
    this.text = raw.text;
    this.segments = raw.segments ?? [];
    this.diarizedSegments = raw.diarizedSegments ?? [];
    this.language = raw.language;
    this.duration = raw.duration;
    this.model = raw.model;
    this.provider = raw.provider;
  }

  toString(): string {
    return this.text;
  }
}
