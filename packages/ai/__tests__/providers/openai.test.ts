import { describe, it, expect, spyOn } from 'bun:test';
import { OpenAIProvider } from '../../src/providers/openai';
import { Lab } from '../../src/enums';

function makeResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('OpenAIProvider', () => {
  it('declares chat + embed capabilities', () => {
    const p = new OpenAIProvider({ apiKey: 'sk-test' });
    const caps = p.capabilities();
    expect(caps.name).toBe(Lab.OpenAI);
    expect(caps.supported.has('chat')).toBe(true);
    expect(caps.supported.has('embed')).toBe(true);
  });

  it('sends chat request to /v1/chat/completions with bearer auth', async () => {
    const p = new OpenAIProvider({ apiKey: 'sk-test', organization: 'org_123' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({
        choices: [{ message: { content: 'hi', tool_calls: [] } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    );

    await p.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['OpenAI-Organization']).toBe('org_123');
    spy.mockRestore();
  });

  it('parses tool_calls from chat response', async () => {
    const p = new OpenAIProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'Calculator', arguments: '{"x":2}' } },
            ],
          },
        }],
      }),
    );
    const r = await p.chat({ model: 'gpt-4o', messages: [] });
    expect(r.toolCalls).toEqual([{ id: 'call_1', name: 'Calculator', arguments: { x: 2 } }]);
    expect(r.text).toBe('');
    spy.mockRestore();
  });

  it('embed posts to /v1/embeddings and returns vectors', async () => {
    const p = new OpenAIProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    );
    const r = await p.embed({ input: ['a', 'b'] });
    expect(r.data).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(r.model).toBe('text-embedding-3-small');
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    spy.mockRestore();
  });
});
