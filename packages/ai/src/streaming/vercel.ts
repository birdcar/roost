import type { StreamEvent } from '../types.js';

/**
 * Vercel AI SDK data-stream-protocol encoder. Wire format: one line per
 * frame, `{code}:{JSON}\n`. Codes:
 *
 *   `0:` text delta
 *   `9:` tool call
 *   `a:` tool result
 *   `d:` finish (aggregated usage)
 *   `3:` error
 *
 * This lets consumers drop `@ai-sdk/react`'s `useChat` hook against a Roost
 * `.toResponse()` with `.usingVercelDataProtocol()`.
 */

const encoder = new TextEncoder();

export function toVercelProtocol(event: StreamEvent): Uint8Array {
  switch (event.type) {
    case 'text-delta':
      return encoder.encode(`0:${JSON.stringify(event.text)}\n`);
    case 'tool-call':
      return encoder.encode(
        `9:${JSON.stringify({ toolCallId: event.id, toolName: event.name, args: event.arguments })}\n`,
      );
    case 'tool-result':
      return encoder.encode(
        `a:${JSON.stringify({ toolCallId: event.toolCallId, result: event.content })}\n`,
      );
    case 'usage':
      return encoder.encode(
        `d:${JSON.stringify({
          finishReason: 'stop',
          usage: { promptTokens: event.promptTokens, completionTokens: event.completionTokens },
        })}\n`,
      );
    case 'error':
      return encoder.encode(`3:${JSON.stringify(event.message)}\n`);
    case 'done':
      return encoder.encode(`d:${JSON.stringify({ finishReason: 'stop' })}\n`);
  }
}

export function toVercelStream(events: AsyncIterable<StreamEvent>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) controller.enqueue(toVercelProtocol(event));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(toVercelProtocol({ type: 'error', message: msg }));
      } finally {
        controller.close();
      }
    },
  });
}