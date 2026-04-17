import type { StreamEvent } from '../types.js';

/**
 * Server-Sent Events wire format: `data: {JSON}\n\n` per W3C EventSource spec.
 * Native protocol — one JSON event per frame, no `event:` field (consumers
 * narrow on the event's own `type` field).
 */

const encoder = new TextEncoder();

export function encodeSSE(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Incrementally parse an SSE stream into `StreamEvent`s. Handles:
 *   - multi-byte UTF-8 sequences split across chunks
 *   - `data:` lines split across chunks (frame boundary only at `\n\n`)
 *   - ignores comments (`: ...`) and other fields
 */
export async function* decodeSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
  const decoder = new TextDecoder('utf-8');
  const reader = stream.getReader();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` preserves partial multi-byte sequences across reads.
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseFrame(frame);
        if (event) yield event;
        boundary = buffer.indexOf('\n\n');
      }
    }
    // Flush any trailing frame without a terminating `\n\n`.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseFrame(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): StreamEvent | null {
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
}

/**
 * Convert an `AsyncIterable<StreamEvent>` into an SSE-encoded
 * `ReadableStream<Uint8Array>`. Used by `StreamableAgentResponse.toResponse()`.
 */
export function toSSEStream(events: AsyncIterable<StreamEvent>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) controller.enqueue(encodeSSE(event));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encodeSSE({ type: 'error', message: msg }));
      } finally {
        controller.close();
      }
    },
  });
}