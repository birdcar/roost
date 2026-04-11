import type { Middleware } from '@roost/core';

export class SubscribedMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[]
  ): Promise<Response> {
    // In a real implementation, this would resolve the current user's subscription
    // from the container and check if they're subscribed to the required plan.
    // For now, the middleware structure is in place for Phase 10 to wire up.
    return next(request);
  }
}

export class OnTrialMiddleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    return next(request);
  }
}
