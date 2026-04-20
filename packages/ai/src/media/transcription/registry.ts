import type { TranscriptionResponse } from './response.js';
import {
  InMemoryMediaCallbackRegistry,
  type MediaCallbackRegistry,
} from '../shared/media-callback-registry.js';

let registry: MediaCallbackRegistry<TranscriptionResponse> =
  new InMemoryMediaCallbackRegistry<TranscriptionResponse>();

export function getTranscriptionCallbackRegistry(): MediaCallbackRegistry<TranscriptionResponse> {
  return registry;
}

export function setTranscriptionCallbackRegistry(r: MediaCallbackRegistry<TranscriptionResponse>): void {
  registry = r;
}

export function resetTranscriptionCallbackRegistry(): void {
  registry = new InMemoryMediaCallbackRegistry<TranscriptionResponse>();
}
