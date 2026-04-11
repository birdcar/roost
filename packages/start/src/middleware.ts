import { createMiddleware } from '@tanstack/react-start';
import type { Application } from '@roost/core';
import type { RoostServerContext } from './types.js';
import { bootApp, createRoostContext } from './context.js';

/**
 * Creates a TanStack Start middleware that boots the Roost Application
 * on cold start and injects a request-scoped container into the
 * middleware context chain.
 *
 * Register in your start configuration's requestMiddleware array,
 * or attach to individual server functions.
 *
 * @example
 * ```typescript
 * import { createRoostMiddleware } from '@roost/start';
 * import { CloudflareServiceProvider } from '@roost/cloudflare';
 *
 * export const roostMiddleware = createRoostMiddleware(() => {
 *   const app = new Application({});
 *   app.register(CloudflareServiceProvider);
 *   return app;
 * });
 * ```
 */
export function createRoostMiddleware(createApp: () => Application) {
  return createMiddleware().server(async ({ next }) => {
    const app = bootApp(createApp);

    if (!app.isBooted) {
      await app.boot();
    }

    const roost = createRoostContext(app);

    return next({ context: { roost } });
  });
}

export type RoostMiddlewareContext = { roost: RoostServerContext };
