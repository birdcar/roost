import type { Agent } from '../agent.js';
import type { StatefulAgent } from '../stateful/agent.js';
import { McpAgent } from './agent.js';

export interface McpHandlerOptions {
  transport?: 'streamable-http' | 'sse' | 'http';
  path?: string;
  authorize?: (request: Request) => boolean | Promise<boolean>;
  exposeSessions?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse<T = unknown> =
  | { jsonrpc: '2.0'; id: string | number | null; result: T }
  | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string; data?: unknown } };

/**
 * Returns a Workers-compatible `fetch` handler implementing the MCP protocol
 * over JSON-RPC. Supports the five core MCP methods (`tools/list`,
 * `tools/call`, `resources/list`, `resources/read`, `prompts/list`,
 * `prompts/get`).
 */
export function createMcpHandler<A extends Agent | StatefulAgent>(
  AgentClass: new (...args: unknown[]) => A,
  opts: McpHandlerOptions = {},
): ExportedHandler<unknown> {
  const path = opts.path ?? '/mcp';
  const mcpAgent = new McpAgent(AgentClass, { exposeSessions: opts.exposeSessions });

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== path) return new Response('Not Found', { status: 404 });
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      if (opts.authorize) {
        const ok = await opts.authorize(request);
        if (!ok) return new Response('Unauthorized', { status: 401 });
      }
      let envelope: JsonRpcRequest;
      try {
        envelope = (await request.json()) as JsonRpcRequest;
      } catch {
        return jsonRpcError(null, -32700, 'Parse error');
      }
      const { id, method, params } = envelope;
      try {
        const result = await dispatch(mcpAgent, method, params ?? {});
        return jsonRpcResult(id, result);
      } catch (err) {
        const message = (err as Error).message || 'Internal error';
        return jsonRpcError(id, -32603, message);
      }
    },
  };
}

async function dispatch<A extends Agent | StatefulAgent>(
  agent: McpAgent<A>,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} } };
    case 'tools/list':
      return { tools: agent.exposedTools() };
    case 'tools/call': {
      const name = params.name as string;
      const args = (params.arguments as Record<string, unknown>) ?? {};
      return agent.handleToolCall(name, args);
    }
    case 'resources/list':
      return { resources: await agent.handleListResources() };
    case 'resources/read': {
      const uri = params.uri as string;
      const content = await agent.handleReadResource(uri);
      return { contents: [content] };
    }
    case 'prompts/list':
      return { prompts: agent.exposedPrompts() };
    case 'prompts/get': {
      const name = params.name as string;
      return agent.handleGetPrompt(name);
    }
    default:
      throw new MethodNotFoundError(method);
  }
}

class MethodNotFoundError extends Error {
  override readonly name = 'MethodNotFoundError';
  constructor(method: string) {
    super(`Method not found: ${method}`);
  }
}

function jsonRpcResult(id: string | number | null, result: unknown): Response {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
