import { describe, it, expect } from 'bun:test';
import { WorkersAIProvider, CloudflareAIProvider } from '../../src/providers/workers-ai';
import type { AIClient } from '@roostjs/cloudflare';
import { Lab } from '../../src/enums';

function makeAIClient(handler: <T>(model: string, inputs: unknown) => Promise<T>): AIClient {
  return { run: handler } as unknown as AIClient;
}

describe('WorkersAIProvider', () => {
  it('declares chat + embed + stream + tools capabilities', () => {
    const p = new WorkersAIProvider(makeAIClient(async () => '' as never));
    const caps = p.capabilities();
    expect(caps.name).toBe(Lab.WorkersAI);
    expect(caps.supported.has('chat')).toBe(true);
    expect(caps.supported.has('embed')).toBe(true);
    expect(caps.supported.has('stream')).toBe(true);
    expect(caps.supported.has('tools')).toBe(true);
  });

  it('forwards chat request to AIClient.run with the given model and messages', async () => {
    let capturedModel: string | undefined;
    let capturedInputs: Record<string, unknown> | undefined;
    const client = makeAIClient(async <T,>(model: string, inputs: unknown): Promise<T> => {
      capturedModel = model;
      capturedInputs = inputs as Record<string, unknown>;
      return 'hi there' as T;
    });

    const p = new WorkersAIProvider(client);
    const result = await p.chat({
      model: '@cf/meta/llama-3.1-8b-instruct',
      messages: [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
      ],
      maxTokens: 256,
      temperature: 0.4,
    });

    expect(capturedModel).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(capturedInputs?.messages).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hello' },
    ]);
    expect(capturedInputs?.max_tokens).toBe(256);
    expect(capturedInputs?.temperature).toBe(0.4);
    expect(result.text).toBe('hi there');
    expect(result.toolCalls).toEqual([]);
  });

  it('stringifies non-string chat responses', async () => {
    const client = makeAIClient(async () => ({ response: 'wrapped' }) as never);
    const p = new WorkersAIProvider(client);
    const r = await p.chat({ model: 'x', messages: [] });
    expect(r.text).toContain('wrapped');
  });

  describe('embed', () => {
    it('returns the vectors from the model response', async () => {
      let capturedModel: string | undefined;
      const client = makeAIClient(async <T,>(model: string): Promise<T> => {
        capturedModel = model;
        return { data: [[0.1, 0.2], [0.3, 0.4]] } as T;
      });
      const p = new WorkersAIProvider(client);
      const r = await p.embed({ input: ['a', 'b'] });
      expect(r.data).toEqual([[0.1, 0.2], [0.3, 0.4]]);
      expect(r.model).toBe('@cf/baai/bge-base-en-v1.5');
      expect(capturedModel).toBe('@cf/baai/bge-base-en-v1.5');
    });

    it('uses a custom model when provided', async () => {
      let capturedModel: string | undefined;
      const client = makeAIClient(async <T,>(model: string): Promise<T> => {
        capturedModel = model;
        return { data: [[0.1]] } as T;
      });
      const p = new WorkersAIProvider(client);
      await p.embed({ input: ['a'], model: '@cf/baai/bge-small-en-v1.5' });
      expect(capturedModel).toBe('@cf/baai/bge-small-en-v1.5');
    });

    it('throws when the model returns no data', async () => {
      const client = makeAIClient(async () => ({ }) as never);
      const p = new WorkersAIProvider(client);
      await expect(p.embed({ input: ['a'] })).rejects.toThrow(/no embedding data/);
    });
  });

  it('CloudflareAIProvider is a deprecated alias of WorkersAIProvider', () => {
    expect(CloudflareAIProvider).toBe(WorkersAIProvider);
  });
});
