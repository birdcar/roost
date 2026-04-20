import { describe, it, expect } from 'bun:test';
import { Agent } from '../../src/agent.js';
import { createMcpHandler } from '../../src/mcp/handler.js';
import type { Tool, ToolRequest } from '../../src/tool.js';

class EchoTool implements Tool {
  name() {
    return 'echo';
  }
  description() {
    return 'Echo input';
  }
  schema(s: typeof import('@roostjs/schema').schema) {
    return { text: s.string() };
  }
  async handle(req: ToolRequest) {
    return String(req.get<string>('text'));
  }
}

class ToolAgent extends Agent {
  instructions() {
    return 'You are a helpful echo agent.';
  }
  tools(): Tool[] {
    return [new EchoTool()];
  }
}

async function invoke(handler: ExportedHandler<unknown>, body: unknown, path = '/mcp') {
  const res = await handler.fetch!(
    new Request(`https://test.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {} as never,
    {} as never,
  );
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

describe('createMcpHandler', () => {
  it('returns 404 for paths other than /mcp', async () => {
    const handler = createMcpHandler(ToolAgent);
    const res = await handler.fetch!(new Request('https://test.example/other'), {} as never, {} as never);
    expect(res.status).toBe(404);
  });

  it('returns 405 for non-POST requests', async () => {
    const handler = createMcpHandler(ToolAgent);
    const res = await handler.fetch!(new Request('https://test.example/mcp'), {} as never, {} as never);
    expect(res.status).toBe(405);
  });

  it('returns initialize capability info', async () => {
    const handler = createMcpHandler(ToolAgent);
    const { body } = await invoke(handler, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    const envelope = body as { result: { protocolVersion: string } };
    expect(envelope.result.protocolVersion).toBe('2024-11-05');
  });

  it('lists tools', async () => {
    const handler = createMcpHandler(ToolAgent);
    const { body } = await invoke(handler, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const envelope = body as { result: { tools: Array<{ name: string }> } };
    expect(envelope.result.tools.map((t) => t.name)).toEqual(['echo']);
  });

  it('dispatches tools/call to the agent', async () => {
    const handler = createMcpHandler(ToolAgent);
    const { body } = await invoke(handler, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hello' } },
    });
    const envelope = body as { result: { content: string } };
    expect(envelope.result.content).toBe('hello');
  });

  it('returns MethodNotFound error for unsupported methods', async () => {
    const handler = createMcpHandler(ToolAgent);
    const { body } = await invoke(handler, { jsonrpc: '2.0', id: 4, method: 'weird' });
    const envelope = body as { error: { message: string } };
    expect(envelope.error.message).toContain('Method not found');
  });

  it('honors authorize callback rejections', async () => {
    const handler = createMcpHandler(ToolAgent, { authorize: () => false });
    const res = await handler.fetch!(
      new Request('https://test.example/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      {} as never,
      {} as never,
    );
    expect(res.status).toBe(401);
  });

  it('exposes a custom path when opts.path is set', async () => {
    const handler = createMcpHandler(ToolAgent, { path: '/api/mcp' });
    const { body } = await invoke(handler, { jsonrpc: '2.0', id: 5, method: 'tools/list' }, '/api/mcp');
    const envelope = body as { result: { tools: Array<{ name: string }> } };
    expect(envelope.result.tools[0].name).toBe('echo');
  });
});
