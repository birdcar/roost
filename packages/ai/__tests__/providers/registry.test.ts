import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../../src/providers/registry';
import { FailoverProvider } from '../../src/providers/failover';
import type { AIProvider, ProviderCapabilities } from '../../src/providers/interface';
import { Lab } from '../../src/enums';

function makeProvider(name: string): AIProvider {
  return {
    name,
    capabilities: (): ProviderCapabilities => ({ name, supported: new Set(['chat']) }),
    chat: async () => ({ text: name, toolCalls: [] }),
  };
}

describe('ProviderRegistry', () => {
  it('stores and retrieves providers by name', () => {
    const r = new ProviderRegistry();
    const p = makeProvider('a');
    r.register(Lab.Anthropic, p);
    expect(r.get(Lab.Anthropic)).toBe(p);
    expect(r.has(Lab.Anthropic)).toBe(true);
    expect(r.has(Lab.OpenAI)).toBe(false);
  });

  it('resolve() throws for unknown provider', () => {
    const r = new ProviderRegistry();
    expect(() => r.resolve('nope')).toThrow(/No AI provider registered/);
  });

  it('resolveFailover returns direct provider for single name', () => {
    const r = new ProviderRegistry();
    const p = makeProvider('a');
    r.register(Lab.Anthropic, p);
    expect(r.resolveFailover(Lab.Anthropic)).toBe(p);
  });

  it('resolveFailover returns FailoverProvider for multiple names', () => {
    const r = new ProviderRegistry();
    r.register(Lab.Anthropic, makeProvider('a'));
    r.register(Lab.OpenAI, makeProvider('b'));
    const resolved = r.resolveFailover([Lab.Anthropic, Lab.OpenAI]);
    expect(resolved).toBeInstanceOf(FailoverProvider);
  });
});
