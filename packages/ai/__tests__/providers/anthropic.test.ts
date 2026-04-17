import { describe, it, expect, spyOn } from 'bun:test';
import { AnthropicProvider } from '../../src/providers/anthropic';
import { Lab } from '../../src/enums';

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AnthropicProvider', () => {
  it('declares correct capabilities', () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const caps = p.capabilities();
    expect(caps.name).toBe(Lab.Anthropic);
    expect(caps.supported.has('chat')).toBe(true);
    expect(caps.supported.has('thinking')).toBe(true);
  });

  it('sends request to /v1/messages with correct auth headers', async () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({ content: [{ type: 'text', text: 'hi' }] }),
    );

    await p.chat({
      model: 'claude-haiku-4-5-20251001',
      messages: [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
      ],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    spy.mockRestore();
  });

  it('parses tool_use blocks into toolCalls', async () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({
        content: [
          { type: 'text', text: 'thinking...' },
          { type: 'tool_use', id: 'call_1', name: 'Calculator', input: { x: 1 } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );

    const result = await p.chat({ model: 'claude-haiku-4-5-20251001', messages: [] });
    expect(result.toolCalls).toEqual([
      { id: 'call_1', name: 'Calculator', arguments: { x: 1 } },
    ]);
    expect(result.text).toBe('thinking...');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    spy.mockRestore();
  });

  it('throws on non-2xx responses with status in message', async () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('bad', { status: 429 }));
    await expect(p.chat({ model: 'x', messages: [] })).rejects.toThrow('Anthropic 429');
    spy.mockRestore();
  });

  it('merges providerOptions (e.g. thinking budget) into request body', async () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse({ content: [{ type: 'text', text: 'ok' }] }),
    );

    await p.chat({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'hi' }],
      providerOptions: { thinking: { type: 'enabled', budget_tokens: 2048 } },
    });

    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
    spy.mockRestore();
  });
});
