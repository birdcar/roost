import { describe, it, expect } from 'bun:test';
import { Agent } from '../../src/agent.js';
import { McpAgent } from '../../src/mcp/agent.js';
import type { Tool, ToolRequest } from '../../src/tool.js';

class EchoTool implements Tool {
  name() {
    return 'echo';
  }
  description() {
    return 'Echo input';
  }
  schema(s: import('@roostjs/schema').SchemaBuilder extends infer _U ? typeof import('@roostjs/schema').schema : never) {
    return { text: s.string() };
  }
  async handle(request: ToolRequest): Promise<string> {
    return String(request.get<string>('text'));
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

describe('McpAgent', () => {
  it('exposes the agent tools as MCP tool descriptors', () => {
    const mcpAgent = new McpAgent(ToolAgent);
    const tools = mcpAgent.exposedTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('echo');
    expect(tools[0].description).toBe('Echo input');
  });

  it('dispatches tool calls through the agent tool', async () => {
    const mcpAgent = new McpAgent(ToolAgent);
    const result = await mcpAgent.handleToolCall('echo', { text: 'hi' });
    expect(result.content).toBe('hi');
  });

  it('returns an error result when the tool is unknown', async () => {
    const mcpAgent = new McpAgent(ToolAgent);
    const result = await mcpAgent.handleToolCall('missing', {});
    expect(result.isError).toBe(true);
  });

  it('exposes a system prompt for Conversational agents', () => {
    class Chatty extends Agent {
      instructions() {
        return 'Hi, I am chatty.';
      }
      messages() {
        return [];
      }
    }
    const mcpAgent = new McpAgent(Chatty);
    const prompts = mcpAgent.exposedPrompts();
    expect(prompts[0].name).toBe('system');
  });

  it('getPrompt("system") returns the agent instructions', async () => {
    const mcpAgent = new McpAgent(ToolAgent);
    const result = await mcpAgent.handleGetPrompt('system');
    expect(result.messages[0].content).toBe('You are a helpful echo agent.');
  });

  it('does not expose Sessions by default', async () => {
    const mcpAgent = new McpAgent(ToolAgent);
    const resources = await mcpAgent.handleListResources();
    expect(resources).toEqual([]);
  });
});
