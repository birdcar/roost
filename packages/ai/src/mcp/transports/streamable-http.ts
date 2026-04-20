import type { McpTransport, McpConnectOptions } from '../types.js';
import { McpConnectionError, McpProtocolError } from '../types.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Streamable-HTTP transport for MCP. Each `request` is a single POST carrying a
 * JSON-RPC envelope; the server responds synchronously. Workers-friendly — no
 * long-lived connection needed for the lifetime of the client.
 */
export class StreamableHttpTransport implements McpTransport {
  readonly kind = 'streamable-http' as const;
  private readonly url: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;
  private nextId = 1;

  constructor(opts: McpConnectOptions) {
    this.url = opts.url;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers ?? {}),
      ...(opts.auth ? { Authorization: `Bearer ${opts.auth.token}` } : {}),
    };
  }

  async request<TResponse = unknown>(method: string, params?: Record<string, unknown>): Promise<TResponse> {
    const envelope: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
      params: params ?? {},
    };
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(envelope),
      });
    } catch (err) {
      throw new McpConnectionError(`MCP transport request failed: ${(err as Error).message}`, err);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new McpConnectionError(`MCP server returned ${response.status}: ${body}`);
    }
    const json = (await response.json()) as JsonRpcResponse<TResponse>;
    if (json.error) {
      throw new McpProtocolError(json.error.message, json.error.code, json.error.data);
    }
    return json.result as TResponse;
  }

  async close(): Promise<void> {
    // No persistent connection; nothing to tear down.
  }
}
