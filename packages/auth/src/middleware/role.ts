import type { Middleware } from '@roostjs/core';
import { SessionManager } from '../session/manager.js';
import type { RoostUser } from '../user.js';

export class RoleMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[]
  ): Promise<Response> {
    const requiredRole = args[0];
    if (!requiredRole) return next(request);

    const sessionManager = (request as any).__roostContainer?.resolve(SessionManager);
    if (!sessionManager) {
      return new Response('Forbidden', { status: 403 });
    }

    const user = await sessionManager.resolveUser(request);
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/auth/login' },
      });
    }

    const hasRole = user.memberships.some(
      (m: { role: string; organizationId: string }) => m.role === requiredRole && (user.organizationId === null || m.organizationId === user.organizationId)
    );

    if (!hasRole) {
      return new Response('Forbidden', { status: 403 });
    }

    return next(request);
  }
}
