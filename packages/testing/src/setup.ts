import { Application } from '@roostjs/core';
import { TestClient } from './client.js';
import { fakeAll, restoreAll } from './fakes.js';

export interface TestContext {
  app: Application;
  client: TestClient;
}

export function createTestApp(env: Record<string, unknown> = {}, config: Record<string, unknown> = {}): Application {
  return Application.create(env, config);
}

export function setupTestSuite(createApp?: () => Application): {
  getContext: () => TestContext;
  beforeAll: () => Promise<void>;
  beforeEach: () => void;
  afterAll: () => void;
} {
  let app: Application;
  let client: TestClient;

  return {
    getContext: () => ({ app, client }),
    beforeAll: async () => {
      app = createApp?.() ?? createTestApp();
      client = new TestClient(app);
      fakeAll();
      await app.boot();
    },
    beforeEach: () => {
      // Reset per-test state if needed
    },
    afterAll: () => {
      restoreAll();
    },
  };
}
