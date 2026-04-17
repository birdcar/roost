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
