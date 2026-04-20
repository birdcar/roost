export { AgentFake, StrayPromptError, buildFakeFromSchema } from './fakes.js';
export type { FakeResponse, FakeResolver } from './fakes.js';

export {
  assertPrompted,
  assertNotPrompted,
  assertNeverPrompted,
  assertQueued,
  assertNotQueued,
  assertNeverQueued,
} from './assertions.js';

export { TestStatefulAgentHarness } from './stateful-harness.js';
export type { BuiltStatefulAgent } from './stateful-harness.js';
export {
  MockDurableObjectState,
  MockDurableObjectStorage,
} from './mock-do-state.js';
export type { MockDurableObjectId, ListOptions as MockListOptions } from './mock-do-state.js';

/* ---------------------------- Phase 6: Media testing --------------------------- */

export { ImageFake, StrayImageError } from '../media/image/testing.js';
export type { ImageFakeResolver, ImageFakeByte } from '../media/image/testing.js';
export { AudioFake, StrayAudioError } from '../media/audio/testing.js';
export type { AudioFakeResolver, AudioFakeByte } from '../media/audio/testing.js';
export { TranscriptionFake, StrayTranscriptionError } from '../media/transcription/testing.js';
export type {
  TranscriptionFakeResolver,
  TranscriptionFakeValue,
} from '../media/transcription/testing.js';
