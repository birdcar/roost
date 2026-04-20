export { Audio, AudioBuilder, QueuedAudioHandle } from './builder.js';
export type { StringableInput } from './builder.js';
export { AudioResponse } from './response.js';
export { AudioPrompt, QueuedAudioPrompt } from './prompt.js';
export { AudioFake, StrayAudioError } from './testing.js';
export type { AudioFakeResolver, AudioFakeByte } from './testing.js';
export { AudioJob } from './job.js';
export type { AudioJobPayload } from './job.js';
export { GeneratingAudio, AudioGenerated } from './events.js';
export {
  getAudioCallbackRegistry,
  setAudioCallbackRegistry,
  resetAudioCallbackRegistry,
} from './registry.js';
