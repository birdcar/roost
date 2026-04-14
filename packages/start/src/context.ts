import type { Application } from '@roostjs/core';
import type { RoostServerContext } from './types.js';

let cachedApp: Application | null = null;

export function bootApp(createApp: () => Application): Application {
  if (cachedApp === null) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export function getApp(): Application {
  if (cachedApp === null) {
    throw new Error(
      'Roost Application not initialized. ' +
      'Call bootApp() before accessing the application, or ensure the Roost middleware is registered.'
    );
  }
  return cachedApp;
}

export function createRoostContext(app: Application): RoostServerContext {
  return {
    container: app.container.scoped(),
    app,
  };
}

export function resetAppCache(): void {
  cachedApp = null;
}
