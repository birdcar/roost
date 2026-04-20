import type { ImageResponse } from './response.js';
import {
  InMemoryMediaCallbackRegistry,
  type MediaCallbackRegistry,
} from '../shared/media-callback-registry.js';

let registry: MediaCallbackRegistry<ImageResponse> = new InMemoryMediaCallbackRegistry<ImageResponse>();

export function getImageCallbackRegistry(): MediaCallbackRegistry<ImageResponse> {
  return registry;
}

export function setImageCallbackRegistry(r: MediaCallbackRegistry<ImageResponse>): void {
  registry = r;
}

export function resetImageCallbackRegistry(): void {
  registry = new InMemoryMediaCallbackRegistry<ImageResponse>();
}
