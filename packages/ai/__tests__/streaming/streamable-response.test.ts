import { describe, it, expect } from 'bun:test';
import type { StreamEvent } from '../../src/types.js';
import {
  StreamableAgentResponse,
  StreamAlreadyConsumedError,
} from '../../src/streaming/streamable-response.js';
import { decodeSSE } from '../../src/streaming/sse.js';

function source(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

describe('StreamableAgentResponse iteration', () => {
  it('yields each source event exactly once', async () => {
    const response = new StreamableAgentResponse(
      source([
        { type: 'text-delta', text: 'hi' },
        { type: 'done' },
      ]),
      'Test',
    );
    const seen: StreamEvent[] = [];
    for await (const e of response) seen.push(e);
    expect(seen).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'done' },
    ]);
  });

  it('throws if iterated twice (stream is single-use)', async () => {
    const response = new StreamableAgentResponse(source([{ type: 'done' }]), 'Test');
    for await (const _ of response) void _;
    await expect(async () => {
      for await (const _ of response) void _;
    }).toThrow(StreamAlreadyConsumedError);
  });
});

describe('StreamableAgentResponse.then hooks', () => {
  it('fires .then() with the collected response after the stream closes', async () => {
    const events: StreamEvent[] = [
      { type: 'text-delta', text: 'hello ' },
      { type: 'text-delta', text: 'world' },
      { type: 'usage', promptTokens: 5, completionTokens: 10 },
      { type: 'done' },
    ];
    const calls: Array<{ text: string; usagePromptTokens?: number }> = [];
    const response = new StreamableAgentResponse(source(events), 'Test').then((r) =>
      calls.push({ text: r.text, usagePromptTokens: r.usage?.promptTokens }),
    );
    for await (const _ of response) void _;
    expect(calls).toEqual([{ text: 'hello world', usagePromptTokens: 5 }]);
  });
});

describe('StreamableAgentResponse.toResponse', () => {
  it('returns an SSE-encoded Response by default', async () => {
    const response = new StreamableAgentResponse(
      source([{ type: 'text-delta', text: 'a' }, { type: 'done' }]),
      'Test',
    );
    const http = await response.toResponse();
    expect(http.headers.get('Content-Type')).toBe('text/event-stream');
    const collected: StreamEvent[] = [];
    for await (const e of decodeSSE(http.body!)) collected.push(e);
    expect(collected).toEqual([{ type: 'text-delta', text: 'a' }, { type: 'done' }]);
  });

  it('switches to Vercel protocol when usingVercelDataProtocol() is called', async () => {
    const response = new StreamableAgentResponse(
      source([{ type: 'text-delta', text: 'x' }, { type: 'done' }]),
      'Test',
    ).usingVercelDataProtocol();
    const http = await response.toResponse();
    expect(http.headers.get('x-vercel-ai-data-stream')).toBe('v1');
    expect(await http.text()).toBe(`0:"x"\nd:${JSON.stringify({ finishReason: 'stop' })}\n`);
  });
});

describe('StreamableAgentResponse.collect', () => {
  it('aggregates text + tool calls + usage into StreamedAgentResponse', async () => {
    const response = new StreamableAgentResponse(
      source([
        { type: 'text-delta', text: 'hi ' },
        { type: 'tool-call', id: 't1', name: 'lookup', arguments: { q: 'x' } },
        { type: 'text-delta', text: 'there' },
        { type: 'usage', promptTokens: 2, completionTokens: 4 },
        { type: 'done' },
      ]),
      'Test',
    );
    const collected = await response.collect();
    expect(collected.text).toBe('hi there');
    expect(collected.toolCalls).toEqual([{ id: 't1', name: 'lookup', arguments: { q: 'x' } }]);
    expect(collected.usage).toEqual({ promptTokens: 2, completionTokens: 4 });
  });
});