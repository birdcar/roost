import type { Middleware } from '@roostjs/core';
import { parseCookie, buildSetCookie } from '../session/manager.js';

const CSRF_COOKIE_NAME = 'roost_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class CsrfMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    if (MUTATION_METHODS.has(request.method)) {
      const cookieToken = parseCookie(request, CSRF_COOKIE_NAME);
      const headerToken = request.headers.get(CSRF_HEADER_NAME);

      if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return new Response('CSRF token mismatch', { status: 403 });
      }
    }

    const response = await next(request);

    if (request.method === 'GET') {
      const existingToken = parseCookie(request, CSRF_COOKIE_NAME);
      if (!existingToken) {
        const token = crypto.randomUUID();
        const cookie = `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Lax; Max-Age=86400`;
        const modified = new Response(response.body, response);
        modified.headers.append('Set-Cookie', cookie);
        return modified;
      }
    }

    return response;
  }
}
