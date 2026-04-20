import type { AIProvider, ProviderCapability } from '../../providers/interface.js';
import { CapabilityNotSupportedError } from '../../providers/interface.js';
import type { Lab } from '../../enums.js';

export type MediaProviderSelector = Lab | string | AIProvider | Array<Lab | string | AIProvider>;

/**
 * Media builders resolve providers through a small in-process map. Host
 * applications register concrete providers via
 * `registerMediaProvider(Lab.WorkersAI, workersAi)` (typically from
 * `AiServiceProvider.boot()`), and builders then resolve by name or by
 * directly-supplied instance.
 *
 * This is intentionally decoupled from the container-backed `ProviderRegistry`
 * so media builders work without the full service provider wiring (e.g. in
 * unit tests with direct provider injection).
 */
const namedProviders = new Map<string, AIProvider>();
let defaultProvider: AIProvider | undefined;

export function registerMediaProvider(name: Lab | string, provider: AIProvider): void {
  namedProviders.set(name, provider);
}

export function unregisterMediaProvider(name: Lab | string): void {
  namedProviders.delete(name);
}

export function setDefaultMediaProvider(provider: AIProvider | undefined): void {
  defaultProvider = provider;
}

export function resetMediaProviders(): void {
  namedProviders.clear();
  defaultProvider = undefined;
}

/**
 * Resolve a selector (name, list, or injected instance) into an ordered list
 * of providers that declare support for the requested capability.
 *
 * The first capable provider is returned; later providers serve as failover
 * candidates for the builder's `.generate()` implementation.
 */
export function resolveMediaProviders(
  capability: ProviderCapability,
  selector: MediaProviderSelector | undefined,
): AIProvider[] {
  const candidates: AIProvider[] = [];
  if (selector === undefined) {
    if (!defaultProvider) {
      throw new Error(
        `No media provider registered. Pass \`{ provider }\` to .generate() or call setDefaultMediaProvider() / registerMediaProvider() during app boot.`,
      );
    }
    candidates.push(defaultProvider);
  } else if (Array.isArray(selector)) {
    for (const entry of selector) candidates.push(toProvider(entry));
  } else {
    candidates.push(toProvider(selector));
  }

  const capable = candidates.filter((p) => p.capabilities().supported.has(capability));
  if (capable.length === 0) {
    const first = candidates[0]!;
    throw new CapabilityNotSupportedError(capability, first.name);
  }
  return capable;
}

function toProvider(entry: Lab | string | AIProvider): AIProvider {
  if (typeof entry === 'string') {
    const found = namedProviders.get(entry);
    if (!found) {
      throw new Error(`No media provider registered under '${entry}'`);
    }
    return found;
  }
  return entry;
}

export function isAIProvider(value: unknown): value is AIProvider {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as AIProvider).name === 'string' &&
    typeof (value as AIProvider).capabilities === 'function' &&
    typeof (value as AIProvider).chat === 'function'
  );
}
