import type { StorableFileLike } from '../../types.js';
import type { ImageAspect, ImageQuality } from '../../providers/interface.js';

/**
 * Value object captured for each Image generation attempt. Inspected by
 * fake-mode assertions: `Image.assertGenerated(p => p.isLandscape())`.
 */
export class ImagePrompt {
  constructor(
    public readonly prompt: string,
    public readonly aspect: ImageAspect | undefined,
    public readonly quality: ImageQuality | undefined,
    public readonly attachmentsList: readonly StorableFileLike[] | undefined,
    public readonly provider: string,
    public readonly options: Record<string, unknown> = {},
  ) {}

  /** Case-insensitive substring test on the prompt text. */
  contains(needle: string): boolean {
    return this.prompt.toLowerCase().includes(needle.toLowerCase());
  }

  isSquare(): boolean {
    return this.aspect === 'square';
  }

  isPortrait(): boolean {
    return this.aspect === 'portrait';
  }

  isLandscape(): boolean {
    return this.aspect === 'landscape';
  }

  hasQuality(q: ImageQuality): boolean {
    return this.quality === q;
  }

  hasAttachments(n?: number): boolean {
    const count = this.attachmentsList?.length ?? 0;
    return n === undefined ? count > 0 : count === n;
  }
}

/** Snapshot of a queued image request for fake assertions. */
export class QueuedImagePrompt {
  constructor(
    public readonly prompt: string,
    public readonly handleId: string,
    public readonly options: Record<string, unknown> = {},
  ) {}

  contains(needle: string): boolean {
    return this.prompt.toLowerCase().includes(needle.toLowerCase());
  }
}
