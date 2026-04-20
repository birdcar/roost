import type { Agent } from '../agent.js';
import { hasTools, isConversational } from '../contracts.js';
import { partitionTools } from '../tool.js';
import type { StatefulAgent } from '../stateful/agent.js';
import { mcpToolFromRoost } from './tool-adapter.js';
import type {
  McpDiscoveredPrompt,
  McpDiscoveredResource,
  McpResourceContent,
  McpToolDescriptor,
  McpToolResult,
} from './types.js';
import { createToolRequest } from '../tool.js';

export interface McpAgentOptions {
  /**
   * When true, `handleListResources()` enumerates the agent's persisted
   * sessions as MCP resources. Defaults to false — Sessions may contain PII.
   */
  exposeSessions?: boolean;
}

type AgentCtor<A extends Agent | StatefulAgent = Agent | StatefulAgent> = new (...args: unknown[]) => A;

/**
 * Wrap an Agent class as an MCP server. Maps the agent's `tools()` into MCP
 * tool descriptors, its Conversational messages into predefined prompts, and
 * (optionally) its Sessions into MCP resources.
 */
export class McpAgent<A extends Agent | StatefulAgent = Agent | StatefulAgent> {
  private cachedInstance?: A;

  constructor(
    public readonly AgentClass: AgentCtor<A>,
    private readonly options: McpAgentOptions = {},
    private readonly factory: () => A = () => new AgentClass() as A,
  ) {}

  /**
   * Lazily create an agent instance for inspection. `McpAgent` is stateless
   * across calls — each instance lives only long enough to answer a request.
   */
  private instance(): A {
    if (!this.cachedInstance) this.cachedInstance = this.factory();
    return this.cachedInstance;
  }

  exposedTools(): McpToolDescriptor[] {
    const agent = this.instance();
    if (!hasTools(agent)) return [];
    const { userTools } = partitionTools(agent.tools());
    return userTools.map(mcpToolFromRoost);
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const agent = this.instance();
    if (!hasTools(agent)) return { content: '', isError: true };
    const { userTools } = partitionTools(agent.tools());
    const tool = userTools.find((t) => (t.name?.() ?? defaultToolName(t.constructor.name)) === name);
    if (!tool) return { content: `Tool '${name}' not found`, isError: true };
    const result = await tool.handle(createToolRequest(args));
    return { content: result };
  }

  async handleListResources(): Promise<McpDiscoveredResource[]> {
    if (!this.options.exposeSessions) return [];
    const agent = this.instance();
    const sessions = (agent as unknown as { sessions?: { listConversations?: () => Promise<Array<{ id: string }>> } }).sessions;
    if (!sessions?.listConversations) return [];
    const convs = await sessions.listConversations();
    return convs.map((c) => ({
      uri: `roost://sessions/${c.id}`,
      name: `Conversation ${c.id}`,
      description: 'Persisted conversation history',
      mimeType: 'application/json',
    }));
  }

  async handleReadResource(uri: string): Promise<McpResourceContent> {
    return { uri, text: '', mimeType: 'application/json' };
  }

  exposedPrompts(): McpDiscoveredPrompt[] {
    const agent = this.instance();
    if (!isConversational(agent)) return [];
    return [
      {
        name: 'system',
        description: 'System instructions for this agent',
      },
    ];
  }

  async handleGetPrompt(name: string): Promise<{ messages: Array<{ role: string; content: string }> }> {
    if (name !== 'system') return { messages: [] };
    const agent = this.instance();
    const instructions =
      typeof (agent as unknown as { instructions?: () => string }).instructions === 'function'
        ? (agent as unknown as { instructions: () => string }).instructions()
        : '';
    return { messages: [{ role: 'system', content: instructions }] };
  }
}

function defaultToolName(className: string): string {
  return className
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
