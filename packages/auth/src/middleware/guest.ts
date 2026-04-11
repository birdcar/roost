import type { Middleware } from '@roost/core';
import { SessionManager } from '../session/manager.js';

export class GuestMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    const sessionManager = (request as any).__roostContainer?.resolve(SessionManager);
    if (!sessionManager) {
      return next(request);
    }

    const user = await sessionManager.resolveUser(request);
    if (user) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/dashboard' },
      });
    }

    return next(request);
  }
}
