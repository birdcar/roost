import type { Middleware } from '@roostjs/core';
import type { RateLimiterConfig } from './types.js';
import type { DurableObjectClient } from '../bindings/durable-objects.js';
import { getActiveRateLimiterFake } from './fake.js';

function defaultKeyExtractor(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For') ??
    'unknown'
  );
}

function tooManyRequests(retryAfter: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: { 'Retry-After': String(retryAfter) },
  });
}

export class DORateLimiter implements Middleware {
  constructor(
    private doClient: DurableObjectClient,
    private config: RateLimiterConfig
  ) {}

  async handle(
    request: Request,
    next: (r: Request) => Promise<Response>
  ): Promise<Response> {
    const extractKey = this.config.keyExtractor ?? defaultKeyExtractor;
    const key = extractKey(request);

    const fake = getActiveRateLimiterFake();
    if (fake) {
      const limited = fake.isLimited(key);
      fake.recordCheck(key, limited);
      if (limited) {
        return tooManyRequests(this.config.window);
      }
      return next(request);
    }

    const { limit, window: windowSeconds } = this.config;
    const doName = `rate-limit:${key}`;

    try {
      const stub = this.doClient.get(doName);
      const response = await stub.fetch('https://do/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, limit, window: windowSeconds }),
      });

      const result = await response.json() as { allowed: boolean; remaining: number; retryAfter?: number };

      if (!result.allowed) {
        return tooManyRequests(result.retryAfter ?? windowSeconds);
      }
    } catch (err) {
      console.error('[DORateLimiter] Failed to check rate limit:', err);
    }

    return next(request);
  }
}
