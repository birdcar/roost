import { describe, it, expect } from 'bun:test';
import { toVercelProtocol, toVercelStream } from '../../src/streaming/vercel.js';
import type { StreamEvent } from '../../src/types.js';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('toVercelProtocol', () => {
  it('encodes text-delta with prefix 0', () => {
    expect(decode(toVercelProtocol({ type: 'text-delta', text: 'hi' }))).toBe('0:"hi"\n');
  });

  it('encodes tool-call with prefix 9 and renamed fields', () => {
    const bytes = toVercelProtocol({ type: 'tool-call', id: 't1', name: 'lookup', arguments: { q: 'x' } });
    expect(decode(bytes)).toBe(`9:${JSON.stringify({ toolCallId: 't1', toolName: 'lookup', args: { q: 'x' } })}\n`);
  });

  it('encodes tool-result with prefix a', () => {
    const bytes = toVercelProtocol({ type: 'tool-result', toolCallId: 't1', content: 'ok' });
    expect(decode(bytes)).toBe(`a:${JSON.stringify({ toolCallId: 't1', result: 'ok' })}\n`);
  });

  it('encodes usage with prefix d including finishReason stop', () => {
    const bytes = toVercelProtocol({ type: 'usage', promptTokens: 5, completionTokens: 10 });
    expect(decode(bytes)).toBe(
      `d:${JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 10 } })}\n`,
    );
  });

  it('encodes error with prefix 3', () => {
    expect(decode(toVercelProtocol({ type: 'error', message: 'oops' }))).toBe('3:"oops"\n');
  });

  it('encodes done as d with only finishReason stop', () => {
    expect(decode(toVercelProtocol({ type: 'done' }))).toBe(`d:${JSON.stringify({ finishReason: 'stop' })}\n`);
  });
});

describe('toVercelStream', () => {
  it('concatenates encoded events into a ReadableStream', async () => {
    async function* src(): AsyncIterable<StreamEvent> {
      yield { type: 'text-delta', text: 'a' };
      yield { type: 'done' };
    }
    const stream = toVercelStream(src());
    const reader = stream.getReader();
    let all = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      all += decode(value);
    }
    expect(all).toBe(`0:"a"\nd:${JSON.stringify({ finishReason: 'stop' })}\n`);
  });
});