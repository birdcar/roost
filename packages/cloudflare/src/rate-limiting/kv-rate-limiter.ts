import type { Middleware } from '@roost/core';
import type { RateLimiterConfig, WindowState } from './types.js';
import { KVStore } from '../bindings/kv.js';
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

export class KVRateLimiter implements Middleware {
  constructor(
    private kv: KVStore,
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
    const now = Date.now();
    const windowIndex = Math.floor(now / (windowSeconds * 1000));
    const windowKey = `rate-limit:${key}:${windowIndex}`;

    let state: WindowState;
    try {
      const raw = await this.kv.get<WindowState>(windowKey, 'json');
      state = raw ?? { count: 0, windowStart: now };
    } catch {
      state = { count: 0, windowStart: now };
    }

    if (state.count >= limit) {
      const nextWindowStart = (windowIndex + 1) * windowSeconds * 1000;
      const retryAfter = Math.ceil((nextWindowStart - now) / 1000);
      return tooManyRequests(retryAfter);
    }

    try {
      await this.kv.putJson(windowKey, { count: state.count + 1, windowStart: state.windowStart }, {
        expirationTtl: windowSeconds * 2,
      });
    } catch (err) {
      console.error('[KVRateLimiter] Failed to write window state:', err);
    }

    return next(request);
  }
}
