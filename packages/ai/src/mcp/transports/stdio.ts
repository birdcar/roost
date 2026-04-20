import type { McpTransport } from '../types.js';
import { McpConnectionError } from '../types.js';

/**
 * Stdio transport — designed for CLI/dev environments. In Workers the stdio
 * pipe does not exist, so every operation rejects. Keeps the import surface
 * uniform between environments.
 */
export class StdioTransport implements McpTransport {
  readonly kind = 'stdio' as const;

  async request<TResponse = unknown>(_method: string, _params?: Record<string, unknown>): Promise<TResponse> {
    throw new McpConnectionError('stdio transport is not available in this environment');
  }

  async close(): Promise<void> {
    /* no-op */
  }
}
