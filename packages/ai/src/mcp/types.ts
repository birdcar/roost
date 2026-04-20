/**
 * Minimal MCP protocol shapes used by the Roost adapter. We model only the
 * subset of the spec the AI package exercises — `tools`, `prompts`, `resources`
 * — over JSON-RPC 2.0. Downstream consumers can drop the upstream SDK in if
 * they need advanced primitives.
 */

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpToolResult {
  content: string | unknown;
  isError?: boolean;
  meta?: Record<string, unknown>;
}

export interface McpDiscoveredPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpDiscoveredResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  text?: string;
  blob?: string;
  mimeType?: string;
}

export type McpTransportKind = 'http' | 'sse' | 'streamable-http' | 'stdio';

export interface McpTransport {
  readonly kind: McpTransportKind;
  request<TResponse = unknown>(method: string, params?: Record<string, unknown>): Promise<TResponse>;
  close(): Promise<void>;
}

export interface McpConnectOptions {
  url: string;
  transport?: McpTransportKind;
  auth?: { token: string };
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export class McpConnectionError extends Error {
  override readonly name = 'McpConnectionError';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class McpProtocolError extends Error {
  override readonly name = 'McpProtocolError';
  constructor(message: string, public readonly code?: number, public readonly data?: unknown) {
    super(message);
  }
}
