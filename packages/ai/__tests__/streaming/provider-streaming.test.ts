import { describe, it, expect, spyOn, afterEach } from 'bun:test';

afterEach(() => {
  // Restore fetch so spyOn accumulations don't leak into later test files.
  (globalThis as { fetch: typeof fetch & { mockRestore?: () => void } }).fetch.mockRestore?.();
});
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { OpenAIProvider } from '../../src/providers/openai.js';
import { GeminiProvider } from '../../src/providers/gemini.js';
import type { StreamEvent } from '../../src/types.js';

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join('')));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of iter) events.push(e);
  return events;
}

describe('AnthropicProvider.stream', () => {
  it('translates Anthropic SSE events into StreamEvents', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10 } } }),
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } }),
      JSON.stringify({ type: 'message_delta', usage: { output_tokens: 8 } }),
      JSON.stringify({ type: 'message_stop' }),
    ]));

    const provider = new AnthropicProvider({ apiKey: 'test' });
    const events = await collect(provider.stream({ model: 'claude-opus-4-7', messages: [] }));
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual(['Hello', ' world']);
    expect(events.find((e) => e.type === 'usage')).toEqual({ type: 'usage', promptTokens: 10, completionTokens: 8 });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  });

  it('accumulates tool-call input_json_delta across fragments', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'lookup' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"q":' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"roost"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'message_stop' }),
    ]));
    const provider = new AnthropicProvider({ apiKey: 'test' });
    const events = await collect(provider.stream({ model: 'claude-opus-4-7', messages: [] }));
    const toolCall = events.find((e) => e.type === 'tool-call');
    expect(toolCall).toEqual({ type: 'tool-call', id: 'tu_1', name: 'lookup', arguments: { q: 'roost' } });
  });
});

describe('OpenAIProvider.stream', () => {
  it('emits text-delta per content chunk and usage at the end', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] }),
      JSON.stringify({ choices: [{ delta: { content: ' there' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }),
      '[DONE]',
    ]));
    const provider = new OpenAIProvider({ apiKey: 'test' });
    const events = await collect(provider.stream({ model: 'gpt-4o-mini', messages: [] }));
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual(['Hi', ' there']);
    expect(events.find((e) => e.type === 'usage')).toEqual({ type: 'usage', promptTokens: 3, completionTokens: 4 });
  });

  it('finalizes tool-call when finish_reason=tool_calls', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'lookup', arguments: '{"q":' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"roost"}' } }] }, finish_reason: 'tool_calls' }] }),
      '[DONE]',
    ]));
    const provider = new OpenAIProvider({ apiKey: 'test' });
    const events = await collect(provider.stream({ model: 'gpt-4o-mini', messages: [] }));
    expect(events.find((e) => e.type === 'tool-call')).toEqual({
      type: 'tool-call', id: 'tc1', name: 'lookup', arguments: { q: 'roost' },
    });
  });
});

describe('GeminiProvider.stream', () => {
  it('yields text-delta per candidate part and usage when present', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse([
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini ' }] } }] }),
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'here' }] } }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 12 },
      }),
    ]));
    const provider = new GeminiProvider({ apiKey: 'test' });
    const events = await collect(provider.stream({ model: 'gemini-2.0-flash', messages: [] }));
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual(['Gemini ', 'here']);
    expect(events.find((e) => e.type === 'usage')).toEqual({ type: 'usage', promptTokens: 7, completionTokens: 12 });
  });
});