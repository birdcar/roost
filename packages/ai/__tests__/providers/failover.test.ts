import { describe, it, expect } from 'bun:test';
import { FailoverProvider, AllProvidersFailedError } from '../../src/providers/failover';
import type { AIProvider, ProviderCapabilities } from '../../src/providers/interface';

function prov(name: string, chat: AIProvider['chat']): AIProvider {
  return {
    name,
    capabilities: (): ProviderCapabilities => ({ name, supported: new Set(['chat']) }),
    chat,
  };
}

describe('FailoverProvider', () => {
  it('returns first provider result when it succeeds', async () => {
    const result = await new FailoverProvider([
      prov('a', async () => ({ text: 'A', toolCalls: [] })),
      prov('b', async () => ({ text: 'B', toolCalls: [] })),
    ]).chat({ model: 'm', messages: [] });
    expect(result.text).toBe('A');
  });

  it('falls through to next provider on error', async () => {
    const result = await new FailoverProvider([
      prov('a', async () => { throw new Error('a failed'); }),
      prov('b', async () => ({ text: 'B wins', toolCalls: [] })),
    ]).chat({ model: 'm', messages: [] });
    expect(result.text).toBe('B wins');
  });

  it('throws AllProvidersFailedError when all fail', async () => {
    const p = new FailoverProvider([
      prov('a', async () => { throw new Error('a'); }),
      prov('b', async () => { throw new Error('b'); }),
    ]);
    await expect(p.chat({ model: 'm', messages: [] })).rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it('throws on empty provider list', () => {
    expect(() => new FailoverProvider([])).toThrow();
  });

  it('capabilities() unions all supported capabilities', () => {
    const failover = new FailoverProvider([
      {
        name: 'a',
        capabilities: () => ({ name: 'a', supported: new Set(['chat']) }),
        chat: async () => ({ text: '', toolCalls: [] }),
      },
      {
        name: 'b',
        capabilities: () => ({ name: 'b', supported: new Set(['chat', 'embed']) }),
        chat: async () => ({ text: '', toolCalls: [] }),
      },
    ]);
    const caps = failover.capabilities();
    expect(caps.supported.has('chat')).toBe(true);
    expect(caps.supported.has('embed')).toBe(true);
  });
});
