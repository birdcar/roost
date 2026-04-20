import type { AudioFormat, AudioGender } from '../../providers/interface.js';

/**
 * Value object captured per Audio generation attempt. Inspected by fake-mode
 * assertions: `Audio.assertGenerated(p => p.isFemale() && p.hasFormat('mp3'))`.
 */
export class AudioPrompt {
  constructor(
    public readonly text: string,
    public readonly gender: AudioGender | undefined,
    public readonly voice: string | undefined,
    public readonly format: AudioFormat | undefined,
    public readonly instructions: string | undefined,
    public readonly speed: number | undefined,
    public readonly provider: string,
  ) {}

  contains(needle: string): boolean {
    return this.text.toLowerCase().includes(needle.toLowerCase());
  }

  /** Alias so user-defined assertions can read the synthesised text uniformly. */
  get prompt(): string {
    return this.text;
  }

  isMale(): boolean {
    return this.gender === 'male';
  }

  isFemale(): boolean {
    return this.gender === 'female';
  }

  hasVoice(id: string): boolean {
    return this.voice === id;
  }

  hasFormat(f: AudioFormat): boolean {
    return this.format === f;
  }
}

export class QueuedAudioPrompt {
  constructor(
    public readonly text: string,
    public readonly handleId: string,
    public readonly options: Record<string, unknown> = {},
  ) {}

  contains(needle: string): boolean {
    return this.text.toLowerCase().includes(needle.toLowerCase());
  }
}
