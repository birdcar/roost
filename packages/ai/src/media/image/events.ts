import { Event } from '@roostjs/events';
import type { ImageResponse } from '../../providers/interface.js';
import type { ImagePrompt } from './prompt.js';

/** Dispatched immediately before the image provider is called. */
export class GeneratingImage extends Event {
  constructor(public readonly prompt: ImagePrompt) {
    super();
  }
}

/** Dispatched after the image provider returns a final response. */
export class ImageGenerated extends Event {
  constructor(
    public readonly prompt: ImagePrompt,
    public readonly response: ImageResponse,
  ) {
    super();
  }
}
