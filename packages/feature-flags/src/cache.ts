import type { FlagValue } from './types.js';
import { FLAG_CACHE_KEY } from './types.js';

export function getRequestCache(request: Request): Map<string, FlagValue> | null {
  return (request as unknown as Record<symbol, Map<string, FlagValue>>)[FLAG_CACHE_KEY] ?? null;
}

export function setRequestCache(request: Request, cache: Map<string, FlagValue>): void {
  (request as unknown as Record<symbol, Map<string, FlagValue>>)[FLAG_CACHE_KEY] = cache;
}
