import type { AIProvider } from './interface.js';
import type { Lab } from '../enums.js';
import { FailoverProvider } from './failover.js';

/**
 * Container-friendly registry mapping named providers (`Lab` or string) to
 * instances. `AiServiceProvider` populates this during `boot()`.
 */
export class ProviderRegistry {
  private readonly map = new Map<string, AIProvider>();

  register(name: Lab | string, provider: AIProvider): void {
    this.map.set(name, provider);
  }

  get(name: Lab | string): AIProvider | undefined {
    return this.map.get(name);
  }

  resolve(name: Lab | string): AIProvider {
    const provider = this.map.get(name);
    if (!provider) throw new Error(`No AI provider registered under '${name}'`);
    return provider;
  }

  /**
   * Resolve a single provider or a failover chain. Accepts `Lab`, string,
   * or an array of either. Single values return the provider directly;
   * arrays return a `FailoverProvider` wrapping the resolved list.
   */
  resolveFailover(names: Lab | string | Array<Lab | string>): AIProvider {
    if (!Array.isArray(names)) return this.resolve(names);
    if (names.length === 1) return this.resolve(names[0]);
    return new FailoverProvider(names.map((n) => this.resolve(n)));
  }

  has(name: Lab | string): boolean {
    return this.map.has(name);
  }

  list(): Array<{ name: string; provider: AIProvider }> {
    return Array.from(this.map.entries()).map(([name, provider]) => ({ name, provider }));
  }
}
