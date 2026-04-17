import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { GatewayAIProvider } from './gateway.js';
import { WorkersAIProvider } from './workers-ai.js';
import type { ProviderRequest } from '../types.js';

function makeFallback(): WorkersAIProvider {
  return {
    name: 'workers-ai',
    capabilities: () => ({ name: 'workers-ai', supported: new Set(['chat']) }),
    chat: async () => ({ text: 'fallback response', toolCalls: [] }),
  } as unknown as WorkersAIProvider;
}

function makeRequest(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    model: '@cf/meta/llama-3.1-8b-instruct',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ],
    ...overrides,
  };
}

function makeGatewayResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({ result: { response: text, tool_calls: [] }, success: true, errors: [] }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('GatewayAIProvider', () => {
  const config = { accountId: 'acc123', gatewayId: 'gw456' };

  it('has correct name', () => {
    const provider = new GatewayAIProvider(config, makeFallback());
    expect(provider.name).toBe('gateway');
  });

  it('sends request to correct gateway URL', async () => {
    const fallback = makeFallback();
    const provider = new GatewayAIProvider(config, fallback);
    const model = '@cf/meta/llama-3.1-8b-instruct';

    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeGatewayResponse('hello'));

    await provider.chat(makeRequest({ model }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/workers-ai/${model}`,
    );

    spy.mockRestore();
  });

  it('parses text response from result.response', async () => {
    const provider = new GatewayAIProvider(config, makeFallback());
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeGatewayResponse('parsed text'));

    const result = await provider.chat(makeRequest());

    expect(result.text).toBe('parsed text');
    spy.mockRestore();
  });

  it('falls back to direct provider on non-2xx gateway response', async () => {
    const fallback = makeFallback();
    const provider = new GatewayAIProvider(config, fallback);
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await provider.chat(makeRequest());

    expect(result.text).toBe('fallback response');
    spy.mockRestore();
  });

  it('falls back to direct provider when gateway fetch throws (network error)', async () => {
    const fallback = makeFallback();
    const provider = new GatewayAIProvider(config, fallback);
    const spy = spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await provider.chat(makeRequest());

    expect(result.text).toBe('fallback response');
    spy.mockRestore();
  });

  it('includes x-session-affinity header when messages include prior conversation turns', async () => {
    const provider = new GatewayAIProvider(config, makeFallback());
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeGatewayResponse('ok'));

    // system + user + assistant + user = prior history
    await provider.chat(
      makeRequest({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First reply' },
          { role: 'user', content: 'Second message' },
        ],
      }),
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-session-affinity']).toBe('true');
    spy.mockRestore();
  });

  it('does NOT include x-session-affinity on first-turn requests (system + single user)', async () => {
    const provider = new GatewayAIProvider(config, makeFallback());
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeGatewayResponse('ok'));

    // system + one user = first turn, no history
    await provider.chat(
      makeRequest({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
      }),
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-session-affinity']).toBeUndefined();
    spy.mockRestore();
  });
});
