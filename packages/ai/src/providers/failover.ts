import type { AIProvider, ProviderCapabilities } from './interface.js';
import type { ProviderRequest, ProviderResponse } from '../types.js';
import { ProviderFailoverTriggered, AllProvidersFailed, dispatchEvent } from '../events.js';

export class AllProvidersFailedError extends Error {
  override readonly name = 'AllProvidersFailedError';
  constructor(public readonly causes: unknown[]) {
    super(`All ${causes.length} providers failed`);
  }
}

/**
 * Wraps an ordered list of providers. On each call, tries each provider in
 * order; on failure (thrown error), routes to the next. Emits a
 * `ProviderFailoverTriggered` event per fallback and throws
 * `AllProvidersFailedError` if every provider fails.
 */
export class FailoverProvider implements AIProvider {
  readonly name: string;

  constructor(private providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error('FailoverProvider requires at least one provider');
    }
    this.name = `failover(${providers.map((p) => p.name).join('→')})`;
  }

  capabilities(): ProviderCapabilities {
    // Report the union of all supported capabilities, using the first
    // provider's chat model hints as defaults.
    const supported = new Set<string>();
    for (const p of this.providers) {
      for (const c of p.capabilities().supported) supported.add(c);
    }
    const first = this.providers[0].capabilities();
    return {
      name: this.name,
      supported: supported as ProviderCapabilities['supported'],
      cheapestChat: first.cheapestChat,
      smartestChat: first.smartestChat,
      defaultEmbed: first.defaultEmbed,
    };
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const causes: unknown[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        return await provider.chat(request);
      } catch (err) {
        causes.push(err);
        const next = this.providers[i + 1];
        if (next) {
          await dispatchEvent(ProviderFailoverTriggered, new ProviderFailoverTriggered(provider, next, err));
        }
      }
    }
    await dispatchEvent(AllProvidersFailed, new AllProvidersFailed(causes));
    throw new AllProvidersFailedError(causes);
  }
}
