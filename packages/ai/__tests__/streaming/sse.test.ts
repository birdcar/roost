import { describe, it, expect } from 'bun:test';
import { encodeSSE, decodeSSE, toSSEStream } from '../../src/streaming/sse.js';
import type { StreamEvent } from '../../src/types.js';

function toStream(bytes: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of bytes) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('encodeSSE', () => {
  it('emits a data frame terminated by double newline', () => {
    const frame = new TextDecoder().decode(encodeSSE({ type: 'text-delta', text: 'hi' }));
    expect(frame).toBe('data: {"type":"text-delta","text":"hi"}\n\n');
  });
});

describe('decodeSSE', () => {
  it('decodes a single frame', async () => {
    const stream = toStream([encodeSSE({ type: 'done' })]);
    const events: StreamEvent[] = [];
    for await (const e of decodeSSE(stream)) events.push(e);
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('round-trips every event variant', async () => {
    const original: StreamEvent[] = [
      { type: 'text-delta', text: 'hello' },
      { type: 'tool-call', id: 't1', name: 'search', arguments: { q: 'roost' } },
      { type: 'tool-result', toolCallId: 't1', content: 'ok' },
      { type: 'usage', promptTokens: 10, completionTokens: 20 },
      { type: 'error', message: 'boom', code: 'E1' },
      { type: 'done' },
    ];
    const bytes = original.map(encodeSSE);
    const decoded: StreamEvent[] = [];
    for await (const e of decodeSSE(toStream(bytes))) decoded.push(e);
    expect(decoded).toEqual(original);
  });

  it('re-assembles frames split across chunk boundaries', async () => {
    const combined = new TextEncoder().encode(
      'data: {"type":"text-delta","text":"split"}\n\n',
    );
    // Split the encoded bytes mid-frame — decoder must buffer.
    const a = combined.slice(0, 10);
    const b = combined.slice(10);
    const events: StreamEvent[] = [];
    for await (const e of decodeSSE(toStream([a, b]))) events.push(e);
    expect(events).toEqual([{ type: 'text-delta', text: 'split' }]);
  });
});

describe('toSSEStream', () => {
  it('pipes an iterable through encodeSSE into a ReadableStream', async () => {
    async function* source(): AsyncIterable<StreamEvent> {
      yield { type: 'text-delta', text: 'x' };
      yield { type: 'done' };
    }
    const collected: StreamEvent[] = [];
    for await (const e of decodeSSE(toSSEStream(source()))) collected.push(e);
    expect(collected).toEqual([{ type: 'text-delta', text: 'x' }, { type: 'done' }]);
  });
});