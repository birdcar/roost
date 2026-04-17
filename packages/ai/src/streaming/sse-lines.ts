/**
 * Low-level helper: parse a `text/event-stream` `ReadableStream<Uint8Array>`
 * into its constituent `data: ...` payload strings (one yield per frame,
 * excluding the `data: ` prefix and trailing `\n\n`).
 *
 * Used by provider `stream()` implementations to translate upstream SSE into
 * Roost's normalized `StreamEvent`. Handles multi-byte UTF-8 boundaries.
 */
export async function* iterateSSELines(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split('\n')) {
          if (line.startsWith('data:')) {
            yield line.slice(5).replace(/^ /, '');
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      for (const line of buffer.split('\n')) {
        if (line.startsWith('data:')) yield line.slice(5).replace(/^ /, '');
      }
    }
  } finally {
    reader.releaseLock();
  }
}