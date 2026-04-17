import { describe, it, expect } from 'bun:test';
import { agent } from '../src/anonymous';
import type { AIProvider, ProviderCapabilities } from '../src/providers/interface';
import type { ProviderRequest, ProviderResponse } from '../src/types';

function makeProvider(chat: (req: ProviderRequest) => Promise<ProviderResponse>): AIProvider {
  return {
    name: 'anon-mock',
    capabilities: (): ProviderCapabilities => ({
      name: 'anon-mock',
      supported: new Set(['chat']),
    }),
    chat,
  };
}

describe('anonymous agent', () => {
  it('prompts with inline instructions + tools via provider instance', async () => {
    const provider = makeProvider(async (req) => {
      expect(req.messages[0].content).toBe('be brief');
      expect(req.messages.at(-1)?.content).toBe('hi');
      return { text: 'hello', toolCalls: [] };
    });

    const a = agent({
      instructions: 'be brief',
      provider,
    });

    const r = await a.prompt('hi');
    if (r.queued === false) {
      expect(r.text).toBe('hello');
    }
  });

  it('supports inline messages() iterable', async () => {
    const provider = makeProvider(async (req) => {
      expect(req.messages).toHaveLength(3);
      expect(req.messages[1].content).toBe('prior');
      return { text: 'ok', toolCalls: [] };
    });

    const a = agent({
      instructions: 'x',
      messages: [{ role: 'user', content: 'prior' }],
      provider,
    });
    await a.prompt('next');
  });

  it('supports inline structured-output schema', async () => {
    const provider = makeProvider(async () => ({
      text: JSON.stringify({ score: 7 }),
      toolCalls: [],
    }));

    const a = agent({
      instructions: 'x',
      schema: (s) => ({ score: s.integer() }),
      provider,
    });
    const r = await a.prompt('rate');
    if (r.queued === false) {
      expect(r.text).toContain('score');
    }
  });

  it('honors optional name override for error messages', async () => {
    const a = agent({ instructions: 'x', name: 'SupportBot' });
    // No provider attached → should throw with the custom name
    await expect(a.prompt('hi')).rejects.toThrow(/SupportBot/);
  });
});
