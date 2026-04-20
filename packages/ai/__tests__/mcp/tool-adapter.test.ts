import { describe, it, expect } from 'bun:test';
import { schema } from '@roostjs/schema';
import { toolFromMcp, mcpToolFromRoost } from '../../src/mcp/tool-adapter.js';
import type { McpClient } from '../../src/mcp/client.js';
import type { Tool, ToolRequest } from '../../src/tool.js';
import { createToolRequest } from '../../src/tool.js';

describe('toolFromMcp', () => {
  it('returns a Tool whose schema mirrors the MCP inputSchema', () => {
    const fakeClient = {
      async callTool(_name: string, _args: Record<string, unknown>) {
        return { content: 'ok' };
      },
    } as unknown as McpClient;

    const tool = toolFromMcp(fakeClient, {
      name: 'search',
      description: 'Search docs',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'query' },
          limit: { type: 'integer' },
        },
        required: ['q'],
      },
    });

    expect(tool.name?.()).toBe('search');
    expect(tool.description()).toBe('Search docs');

    const schemaMap = tool.schema(schema);
    expect(Object.keys(schemaMap).sort()).toEqual(['limit', 'q']);
    expect(schemaMap.q.build().type).toBe('string');
    expect(schemaMap.q.build().description).toBe('query');
    expect(schemaMap.limit.build().type).toBe('integer');
  });

  it('handle() forwards arguments to the client and returns content as string', async () => {
    let seenName = '';
    let seenArgs: Record<string, unknown> = {};
    const fakeClient = {
      async callTool(name: string, args: Record<string, unknown>) {
        seenName = name;
        seenArgs = args;
        return { content: 'response-body' };
      },
    } as unknown as McpClient;

    const tool = toolFromMcp(fakeClient, {
      name: 'search',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    });
    const request: ToolRequest = createToolRequest({ q: 'hello' });
    const result = await tool.handle(request);
    expect(result).toBe('response-body');
    expect(seenName).toBe('search');
    expect(seenArgs).toEqual({ q: 'hello' });
  });

  it('stringifies non-string content', async () => {
    const fakeClient = {
      async callTool() {
        return { content: [{ type: 'text', text: 'hi' }] };
      },
    } as unknown as McpClient;
    const tool = toolFromMcp(fakeClient, { name: 'x', inputSchema: { type: 'object', properties: {}, required: [] } });
    const result = await tool.handle(createToolRequest({}));
    expect(result).toBe(JSON.stringify([{ type: 'text', text: 'hi' }]));
  });
});

describe('mcpToolFromRoost', () => {
  it('converts a Roost Tool into an MCP descriptor', () => {
    const tool: Tool = {
      description(): string {
        return 'Echo';
      },
      schema(s) {
        return { text: s.string() };
      },
      async handle(request) {
        return String(request.get<string>('text'));
      },
    };
    const descriptor = mcpToolFromRoost(tool);
    expect(descriptor.description).toBe('Echo');
    const schemaNode = descriptor.inputSchema as { type: string; properties: Record<string, { type: string }>; required: string[] };
    expect(schemaNode.type).toBe('object');
    expect(schemaNode.properties.text.type).toBe('string');
    expect(schemaNode.required).toEqual(['text']);
  });
});
