import type { McpTransport, McpConnectOptions } from '../types.js';
import { StreamableHttpTransport } from './streamable-http.js';

/**
 * SSE transport — degrades to `StreamableHttpTransport` in Workers. CF Workers
 * cannot hold long-lived server-sent event connections without hibernation, so
 * we short-circuit to streamable-HTTP which delivers the same request/response
 * contract per RPC call. The stub remains here so callers can opt into SSE
 * semantics in environments that support them.
 */
export class SseTransport implements McpTransport {
  readonly kind = 'sse' as const;
  private readonly inner: StreamableHttpTransport;

  constructor(opts: McpConnectOptions) {
    this.inner = new StreamableHttpTransport(opts);
  }

  request<TResponse = unknown>(method: string, params?: Record<string, unknown>): Promise<TResponse> {
    return this.inner.request<TResponse>(method, params);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
