import { WorkOS } from '@workos-inc/node';
import type { FlagContext, FlagProvider, FlagValue } from '../types.js';

export class WorkOSFlagProvider implements FlagProvider {
  private sdk: WorkOS;

  constructor(apiKey: string) {
    this.sdk = new WorkOS(apiKey);
  }

  async evaluate(key: string, _context?: FlagContext): Promise<FlagValue> {
    const flag = await this.sdk.featureFlags.getFeatureFlag(key);
    return flag.enabled;
  }
}
