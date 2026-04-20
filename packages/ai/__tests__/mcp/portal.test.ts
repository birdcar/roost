import { describe, it, expect } from 'bun:test';
import { Agent } from '../../src/agent.js';
import { McpAgent } from '../../src/mcp/agent.js';
import { McpPortal, PortalPrefixCollisionError } from '../../src/mcp/portal.js';
import { McpClient } from '../../src/mcp/client.js';
import type { Tool, ToolRequest } from '../../src/tool.js';

class LookupTool implements Tool {
  name() {
    return 'lookup';
  }
  description() {
    return 'Lookup';
  }
  schema(s: typeof import('@roostjs/schema').schema) {
    return { id: s.string() };
  }
  async handle(req: ToolRequest) {
    return `local:${req.get<string>('id')}`;
  }
}

class LocalAgent extends Agent {
  instructions() {
    return 'local';
  }
  tools(): Tool[] {
    return [new LookupTool()];
  }
}

describe('McpPortal', () => {
  it('aggregates tools with prefix namespaces', async () => {
    const portal = new McpPortal([
      { prefix: 'local', client: new McpAgent(LocalAgent) },
    ]);
    const tools = await portal.aggregatedTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name!()).toBe('local.lookup');
  });

  it('routes callTool back to the originating server', async () => {
    const portal = new McpPortal([
      { prefix: 'local', client: new McpAgent(LocalAgent) },
    ]);
    const result = await portal.callTool('local.lookup', { id: '42' });
    expect(result).toBe('local:42');
  });

  it('rejects prefixes that contain a dot at construction', () => {
    expect(() => new McpPortal([{ prefix: 'bad.prefix', client: new McpAgent(LocalAgent) }]))
      .toThrow(PortalPrefixCollisionError);
  });

  it('throws when an upstream tool name already contains a dot', async () => {
    class DottedTool implements Tool {
      name() {
        return 'dotted.name';
      }
      description() {
        return '';
      }
      schema() {
        return {};
      }
      async handle() {
        return '';
      }
    }
    class DottedAgent extends Agent {
      instructions() {
        return 'd';
      }
      tools(): Tool[] {
        return [new DottedTool()];
      }
    }
    const portal = new McpPortal([{ prefix: 'x', client: new McpAgent(DottedAgent) }]);
    await expect(portal.aggregatedTools()).rejects.toThrow(PortalPrefixCollisionError);
  });

  it('supports aggregating across an McpClient upstream', async () => {
    // Stub out the remote server with a tiny fetch that resolves tools/list and tools/call.
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { id: number; method: string; params?: Record<string, unknown> };
      let result: unknown = {};
      if (body.method === 'initialize') result = {};
      else if (body.method === 'tools/list')
        result = { tools: [{ name: 'remote-search', description: 'rs', inputSchema: { type: 'object', properties: {}, required: [] } }] };
      else if (body.method === 'tools/call') result = { content: `remote:${(body.params?.arguments as Record<string, unknown>).q}` };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = await McpClient.connect({ url: 'https://remote', fetch: fetch as typeof globalThis.fetch });
    const portal = new McpPortal([{ prefix: 'remote', client }]);
    const tools = await portal.aggregatedTools();
    expect(tools[0].name!()).toBe('remote.remote-search');
    const result = await portal.callTool('remote.remote-search', { q: 'hi' });
    expect(result).toBe('remote:hi');
  });
});
