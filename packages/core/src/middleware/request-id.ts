import type { Middleware } from '../types.js';
import { Logger } from '../logger.js';

export class RequestIdMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    const url = new URL(request.url);
    const logger = new Logger({
      requestId,
      method: request.method,
      path: url.pathname,
    });

    const container = (request as any).__roostContainer;
    container?.bind(Logger, () => logger);

    const response = await next(request);
    const modified = new Response(response.body, response);
    modified.headers.set('X-Request-Id', requestId);
    return modified;
  }
}
