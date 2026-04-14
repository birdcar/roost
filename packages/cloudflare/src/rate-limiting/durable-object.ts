import type { WindowState } from './types.js';

interface CheckBody {
  key: string;
  limit: number;
  window: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export class RateLimiterDO {
  private state: DurableObjectState;
  private windows = new Map<string, WindowState>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/check') {
      const body = await request.json() as CheckBody;
      const { key, limit, window: windowSeconds } = body;

      const now = Date.now();
      const windowIndex = Math.floor(now / (windowSeconds * 1000));
      const windowKey = `${key}:${windowIndex}`;

      let windowState = this.windows.get(windowKey);
      if (!windowState) {
        windowState = { count: 0, windowStart: now };
        this.windows.set(windowKey, windowState);

        for (const [k] of this.windows) {
          const [, storedIndex] = k.split(':');
          if (Number(storedIndex) < windowIndex) {
            this.windows.delete(k);
          }
        }
      }

      if (windowState.count >= limit) {
        const nextWindowStart = (windowIndex + 1) * windowSeconds * 1000;
        const retryAfter = Math.ceil((nextWindowStart - now) / 1000);
        const result: CheckResult = { allowed: false, remaining: 0, retryAfter };
        return Response.json(result);
      }

      windowState.count++;
      const result: CheckResult = { allowed: true, remaining: limit - windowState.count };
      return Response.json(result);
    }

    return new Response('Not Found', { status: 404 });
  }
}
