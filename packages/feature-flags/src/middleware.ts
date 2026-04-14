import type { Middleware } from '@roost/core';
import type { FlagValue } from './types.js';
import { FeatureFlag } from './feature-flag.js';
import { setRequestCache } from './cache.js';

export class FeatureFlagMiddleware implements Middleware {
  constructor(private flags: string[]) {}

  async handle(
    request: Request,
    next: (r: Request) => Promise<Response>
  ): Promise<Response> {
    const values = await Promise.all(
      this.flags.map(async (flag) => {
        try {
          const value = await FeatureFlag.getValue<FlagValue>(flag, undefined).catch(() => null);
          return [flag, value] as [string, FlagValue | null];
        } catch {
          return [flag, null] as [string, FlagValue | null];
        }
      })
    );

    const cache = new Map<string, FlagValue>();
    for (const [flag, value] of values) {
      if (value !== null) {
        cache.set(flag, value);
      }
    }

    setRequestCache(request, cache);

    return next(request);
  }
}
