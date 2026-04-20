import { describe, it, expect, afterEach } from 'bun:test';
import { Transcription } from '../../../src/media/transcription';
import {
  CapabilityNotSupportedError,
  type AIProvider,
  type ProviderCapabilities,
  type TranscribeRequest,
  type TranscribeResponse as ProviderTranscribeResponse,
} from '../../../src/providers/interface';
import {
  setDefaultMediaProvider,
  resetMediaProviders,
} from '../../../src/media/shared/provider-resolver';

class FakeTranscribeProvider implements AIProvider {
  readonly name = 'fake-transcribe-provider';
  calls: TranscribeRequest[] = [];
  constructor(
    private response: ProviderTranscribeResponse,
    private readonly diarizeSupported = true,
  ) {}
  capabilities(): ProviderCapabilities {
    return { name: this.name, supported: new Set(['transcribe', 'chat']) };
  }
  async chat(): Promise<never> { throw new Error('not implemented'); }
  async transcribe(request: TranscribeRequest): Promise<ProviderTranscribeResponse> {
    if (request.diarize && !this.diarizeSupported) {
      throw new CapabilityNotSupportedError('transcribe', this.name, 'diarization unavailable');
    }
    this.calls.push(request);
    return this.response;
  }
}

const AUDIO_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04]);

describe('TranscriptionBuilder', () => {
  afterEach(() => {
    Transcription.restore();
    resetMediaProviders();
  });

  it('fromString() passes bytes and mimeType to the provider', async () => {
    const provider = new FakeTranscribeProvider({
      text: 'hello world', model: 'whisper-1', provider: 'fake-transcribe-provider',
    });
    setDefaultMediaProvider(provider);

    const response = await Transcription.fromString(AUDIO_BYTES, 'audio/mpeg')
      .language('en')
      .prompt('marketing vocabulary')
      .generate();

    expect(response.text).toBe('hello world');
    expect(provider.calls[0]!.mimeType).toBe('audio/mpeg');
    expect(provider.calls[0]!.language).toBe('en');
    expect(provider.calls[0]!.prompt).toBe('marketing vocabulary');
    expect(provider.calls[0]!.bytes).toEqual(AUDIO_BYTES);
  });

  it('diarize() propagates to the provider', async () => {
    const provider = new FakeTranscribeProvider({
      text: 'speakers overlap', model: 'whisper-1', provider: 'fake-transcribe-provider',
      diarizedSegments: [{ start: 0, end: 1, text: 'hi', speaker: 'A' }],
    });
    setDefaultMediaProvider(provider);

    const response = await Transcription.fromString(AUDIO_BYTES, 'audio/wav').diarize().generate();
    expect(provider.calls[0]!.diarize).toBe(true);
    expect(response.diarizedSegments).toHaveLength(1);
  });

  it('rejects temperature outside [0,1]', () => {
    expect(() => Transcription.fromString(AUDIO_BYTES, 'audio/wav').temperature(2)).toThrow();
  });

  it('surfaces CapabilityNotSupportedError from the provider', async () => {
    const provider = new FakeTranscribeProvider({
      text: 'x', model: 'whisper-1', provider: 'fake-transcribe-provider',
    }, false);
    setDefaultMediaProvider(provider);
    await expect(
      Transcription.fromString(AUDIO_BYTES, 'audio/wav').diarize().generate(),
    ).rejects.toThrow(CapabilityNotSupportedError);
  });

  it('fake() records prompts and rotates responses', async () => {
    Transcription.fake(['first', 'second']);
    const r1 = await Transcription.fromString(AUDIO_BYTES, 'audio/wav').generate();
    const r2 = await Transcription.fromString(AUDIO_BYTES, 'audio/wav').generate();
    expect(r1.text).toBe('first');
    expect(r2.text).toBe('second');
    Transcription.assertGenerated();
  });

  it('assertGenerated with a predicate checks prompt metadata', async () => {
    Transcription.fake(['hello']);
    await Transcription.fromString(AUDIO_BYTES, 'audio/wav').language('en').diarize().generate();
    expect(() =>
      Transcription.assertGenerated((p) => p.isDiarized() && p.language === 'en'),
    ).not.toThrow();
  });

  it('fromUpload() reads bytes from the blob lazily', async () => {
    const provider = new FakeTranscribeProvider({
      text: 'upload', model: 'whisper-1', provider: 'fake-transcribe-provider',
    });
    setDefaultMediaProvider(provider);
    const blob = new Blob([AUDIO_BYTES], { type: 'audio/wav' });
    const response = await Transcription.fromUpload(blob).generate();
    expect(response.text).toBe('upload');
    expect(provider.calls[0]!.mimeType).toBe('audio/wav');
  });
});

describe('Transcription.queue()', () => {
  afterEach(() => {
    Transcription.restore();
  });

  it('records queued transcriptions when faking', async () => {
    Transcription.fake();
    Transcription.fromString(AUDIO_BYTES, 'audio/wav').queue();
    Transcription.assertQueued();
  });
});
