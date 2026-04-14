import type { Middleware } from '../types.js';
import { verifyWebhook, WebhookVerificationError } from './verify.js';
import type { WebhookVerifyOptions } from './verify.js';

export class WebhookMiddleware implements Middleware {
  constructor(private options: WebhookVerifyOptions) {}

  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    try {
      const body = await verifyWebhook(request, this.options);
      const enriched = new Request(request, { body });
      return next(enriched);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  }
}
