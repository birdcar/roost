// @roostjs/ai/media — media generation (Image, Audio, Transcription).

export * from './image/index.js';
export * from './audio/index.js';
export * from './transcription/index.js';
export { UnsupportedOptionDropped } from './shared/events.js';
export {
  setMediaStorageResolver,
  getMediaStorageResolver,
  MediaStorageUnavailableError,
} from './shared/storage.js';
export type { MediaStorageResolver, MediaPutOptions } from './shared/storage.js';
export {
  registerMediaProvider,
  unregisterMediaProvider,
  setDefaultMediaProvider,
  resetMediaProviders,
  resolveMediaProviders,
} from './shared/provider-resolver.js';
export type { MediaProviderSelector } from './shared/provider-resolver.js';
export {
  InMemoryMediaCallbackRegistry,
  generateHandleId,
} from './shared/media-callback-registry.js';
export type {
  MediaCallbackRegistry,
  MediaFulfillCallback,
  MediaRejectCallback,
} from './shared/media-callback-registry.js';
