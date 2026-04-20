import { describe, it, expect } from 'bun:test';
import { McpClient } from '../../src/mcp/client.js';
import { StreamableHttpTransport } from '../../src/mcp/transports/streamable-http.js';
import { McpConnectionError, McpProtocolError } from '../../src/mcp/types.js';

function fetchStub(handler: (envelope: { method: string; params: unknown }) => Record<string, unknown> | { _status: number; body: string } | { _error: { code: number; message: string } }) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { id: number; method: string; params: unknown };
    const decision = handler({ method: body.method, params: body.params });
    if ('_status' in decision) {
      return new Response(decision.body, { status: decision._status });
    }
    if ('_error' in decision) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: decision._error }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: decision }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

describe('StreamableHttpTransport', () => {
  it('posts JSON-RPC 2.0 envelopes and extracts result', async () => {
    let seenMethod = '';
    const fetch = fetchStub(({ method }) => {
      seenMethod = method;
      return { ok: true };
    });
    const t = new StreamableHttpTransport({ url: 'https://mcp.example.com', fetch: fetch as typeof globalThis.fetch });
    const result = await t.request<{ ok: boolean }>('tools/list');
    expect(result).toEqual({ ok: true });
    expect(seenMethod).toBe('tools/list');
  });

  it('adds bearer token when auth is configured', async () => {
    let seenAuth = '';
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth = (init?.headers as Record<string, string>).Authorization ?? '';
      const body = JSON.parse(init?.body as string) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const t = new StreamableHttpTransport({ url: 'https://mcp.example.com', auth: { token: 'secret' }, fetch: fetch as typeof globalThis.fetch });
    await t.request('tools/list');
    expect(seenAuth).toBe('Bearer secret');
  });

  it('propagates JSON-RPC error as McpProtocolError', async () => {
    const fetch = fetchStub(() => ({ _error: { code: -32601, message: 'Method not found' } }));
    const t = new StreamableHttpTransport({ url: 'https://mcp.example.com', fetch: fetch as typeof globalThis.fetch });
    await expect(t.request('unknown')).rejects.toThrow(McpProtocolError);
  });

  it('throws McpConnectionError on HTTP non-2xx', async () => {
    const fetch = fetchStub(() => ({ _status: 500, body: 'internal' }));
    const t = new StreamableHttpTransport({ url: 'https://mcp.example.com', fetch: fetch as typeof globalThis.fetch });
    await expect(t.request('tools/list')).rejects.toThrow(McpConnectionError);
  });
});

describe('McpClient', () => {
  it('initializes on connect and discovers tools', async () => {
    const seen: string[] = [];
    const fetch = fetchStub(({ method }) => {
      seen.push(method);
      if (method === 'initialize') return { serverInfo: { name: 'srv' } };
      if (method === 'tools/list')
        return {
          tools: [
            {
              name: 'search',
              description: 'Search docs',
              inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
            },
          ],
        };
      return {};
    });
    const client = await McpClient.connect({ url: 'https://srv', fetch: fetch as typeof globalThis.fetch });
    const tools = await client.tools();
    expect(seen[0]).toBe('initialize');
    expect(tools.length).toBe(1);
    expect(tools[0].name!()).toBe('search');
    expect(tools[0].description()).toBe('Search docs');
  });

  it('callTool invokes tools/call with name and arguments', async () => {
    let params: unknown = null;
    const fetch = fetchStub(({ method, params: p }) => {
      if (method === 'tools/call') {
        params = p;
        return { content: 'result-text' };
      }
      return {};
    });
    const client = await McpClient.connect({ url: 'https://srv', fetch: fetch as typeof globalThis.fetch });
    const r = await client.callTool('search', { q: 'hi' });
    expect(r.content).toBe('result-text');
    expect(params).toEqual({ name: 'search', arguments: { q: 'hi' } });
  });

  it('readResource returns the first content entry', async () => {
    const fetch = fetchStub(({ method }) => {
      if (method === 'resources/read')
        return { contents: [{ uri: 'file://a', text: 'hello', mimeType: 'text/plain' }] };
      return {};
    });
    const client = await McpClient.connect({ url: 'https://srv', fetch: fetch as typeof globalThis.fetch });
    const content = await client.readResource('file://a');
    expect(content.text).toBe('hello');
  });

  it('caches tool discovery across repeat calls', async () => {
    let listCount = 0;
    const fetch = fetchStub(({ method }) => {
      if (method === 'tools/list') {
        listCount++;
        return { tools: [] };
      }
      return {};
    });
    const client = await McpClient.connect({ url: 'https://srv', fetch: fetch as typeof globalThis.fetch });
    await client.listTools();
    await client.listTools();
    expect(listCount).toBe(1);
  });
});
