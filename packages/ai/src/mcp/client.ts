import type {
  McpConnectOptions,
  McpDiscoveredPrompt,
  McpDiscoveredResource,
  McpResourceContent,
  McpToolDescriptor,
  McpToolResult,
  McpTransport,
} from './types.js';
import { StreamableHttpTransport } from './transports/streamable-http.js';
import { SseTransport } from './transports/sse.js';
import { StdioTransport } from './transports/stdio.js';
import type { Tool } from '../tool.js';
import { toolFromMcp } from './tool-adapter.js';

/**
 * `McpClient` — consume a remote MCP server. Connect via one of the supported
 * transports, discover capabilities, and adapt tools into Roost's `Tool` shape
 * so they drop into any agent's `tools()` list.
 */
export class McpClient {
  private toolsCache?: McpToolDescriptor[];

  constructor(private readonly transport: McpTransport) {}

  static async connect(opts: McpConnectOptions): Promise<McpClient> {
    const transport = resolveTransport(opts);
    const client = new McpClient(transport);
    await client.initialize();
    return client;
  }

  static fromTransport(transport: McpTransport): McpClient {
    return new McpClient(transport);
  }

  private async initialize(): Promise<void> {
    await this.transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'roostjs-ai', version: '0.3.0' },
    });
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    if (this.toolsCache) return this.toolsCache;
    const result = await this.transport.request<{ tools: McpToolDescriptor[] }>('tools/list');
    this.toolsCache = result.tools ?? [];
    return this.toolsCache;
  }

  async tools(): Promise<Tool[]> {
    const discovered = await this.listTools();
    return discovered.map((t) => toolFromMcp(this, t));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.transport.request<McpToolResult>('tools/call', { name, arguments: args });
  }

  async prompts(): Promise<McpDiscoveredPrompt[]> {
    const result = await this.transport.request<{ prompts: McpDiscoveredPrompt[] }>('prompts/list');
    return result.prompts ?? [];
  }

  async resources(): Promise<McpDiscoveredResource[]> {
    const result = await this.transport.request<{ resources: McpDiscoveredResource[] }>('resources/list');
    return result.resources ?? [];
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const result = await this.transport.request<{ contents: McpResourceContent[] }>('resources/read', { uri });
    const first = result.contents?.[0];
    if (!first) return { uri };
    return first;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

function resolveTransport(opts: McpConnectOptions): McpTransport {
  const kind = opts.transport ?? 'streamable-http';
  switch (kind) {
    case 'streamable-http':
    case 'http':
      return new StreamableHttpTransport(opts);
    case 'sse':
      return new SseTransport(opts);
    case 'stdio':
      return new StdioTransport();
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return new StreamableHttpTransport(opts);
    }
  }
}
