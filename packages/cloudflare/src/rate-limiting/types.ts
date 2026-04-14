export type KeyExtractor = (request: Request) => string;

export interface RateLimiterConfig {
  limit: number;
  window: number;
  keyExtractor?: KeyExtractor;
}

export interface WindowState {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}
