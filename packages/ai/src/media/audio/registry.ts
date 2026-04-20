import type { AudioResponse } from './response.js';
import {
  InMemoryMediaCallbackRegistry,
  type MediaCallbackRegistry,
} from '../shared/media-callback-registry.js';

let registry: MediaCallbackRegistry<AudioResponse> = new InMemoryMediaCallbackRegistry<AudioResponse>();

export function getAudioCallbackRegistry(): MediaCallbackRegistry<AudioResponse> {
  return registry;
}

export function setAudioCallbackRegistry(r: MediaCallbackRegistry<AudioResponse>): void {
  registry = r;
}

export function resetAudioCallbackRegistry(): void {
  registry = new InMemoryMediaCallbackRegistry<AudioResponse>();
}
