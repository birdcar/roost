import type { Agent } from '../agent.js';
import type { StatefulAgent } from '../stateful/agent.js';
import type { Tool, ToolRequest } from '../tool.js';
import { resolveToolName } from '../tool.js';
import { McpClient } from './client.js';
import { McpAgent } from './agent.js';
import type { McpToolDescriptor } from './types.js';
import { schema as schemaBuilder, type SchemaBuilder } from '@roostjs/schema';

export class PortalPrefixCollisionError extends Error {
  override readonly name = 'PortalPrefixCollisionError';
  constructor(toolName: string) {
    super(`Tool name '${toolName}' contains '.' which collides with the portal prefix separator.`);
  }
}

export interface PortalServer {
  prefix: string;
  client: McpClient | McpAgent<Agent | StatefulAgent>;
}

/**
 * `McpPortal` — composes multiple remote MCP servers (or `McpAgent` wrappers)
 * behind a single endpoint. Tools from each upstream are prefixed to prevent
 * collisions.
 */
export class McpPortal {
  constructor(private readonly servers: PortalServer[]) {
    for (const s of servers) {
      if (s.prefix.includes('.')) {
        throw new PortalPrefixCollisionError(s.prefix);
      }
    }
  }

  async aggregatedTools(): Promise<Tool[]> {
    const out: Tool[] = [];
    for (const server of this.servers) {
      const tools = server.client instanceof McpClient
        ? await server.client.tools()
        : server.client.exposedTools().map((d) => mcpDescriptorToTool(server.client as McpAgent, d));
      for (const tool of tools) {
        const originalName = resolveToolName(tool);
        if (originalName.includes('.')) {
          throw new PortalPrefixCollisionError(originalName);
        }
        out.push(renameTool(tool, `${server.prefix}.${originalName}`));
      }
    }
    return out;
  }

  /**
   * Route an aggregated tool call back to the originating server. The prefix
   * is stripped before dispatch.
   */
  async callTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
    const separator = prefixedName.indexOf('.');
    if (separator === -1) throw new Error(`Tool '${prefixedName}' is not prefixed.`);
    const prefix = prefixedName.slice(0, separator);
    const name = prefixedName.slice(separator + 1);
    const server = this.servers.find((s) => s.prefix === prefix);
    if (!server) throw new Error(`No upstream server with prefix '${prefix}'.`);
    if (server.client instanceof McpClient) {
      const result = await server.client.callTool(name, args);
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }
    const result = await server.client.handleToolCall(name, args);
    return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  }
}

function renameTool(tool: Tool, newName: string): Tool {
  return {
    name(): string {
      return newName;
    },
    description(): string {
      return tool.description();
    },
    schema(s) {
      return tool.schema(s);
    },
    handle(request: ToolRequest) {
      return tool.handle(request);
    },
  };
}

function mcpDescriptorToTool(agent: McpAgent, desc: McpToolDescriptor): Tool {
  return {
    name(): string {
      return desc.name;
    },
    description(): string {
      return desc.description ?? '';
    },
    schema(s: typeof schemaBuilder): Record<string, SchemaBuilder> {
      const node = desc.inputSchema as { type?: string; properties?: Record<string, { type?: string }> } | undefined;
      if (!node || node.type !== 'object' || !node.properties) return {};
      const out: Record<string, SchemaBuilder> = {};
      for (const [key, prop] of Object.entries(node.properties)) {
        out[key] = jsonTypeToBuilder(s, prop.type);
      }
      return out;
    },
    async handle(request: ToolRequest): Promise<string> {
      const args: Record<string, unknown> = {};
      for (const k of Object.keys(request)) {
        if (k === 'get') continue;
        args[k] = (request as Record<string, unknown>)[k];
      }
      const result = await agent.handleToolCall(desc.name, args);
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    },
  };
}

function jsonTypeToBuilder(s: typeof schemaBuilder, type: string | undefined): SchemaBuilder {
  switch (type) {
    case 'string':
      return s.string();
    case 'integer':
      return s.integer();
    case 'number':
      return s.number();
    case 'boolean':
      return s.boolean();
    case 'array':
      return s.array();
    case 'object':
      return s.object();
    default:
      return s.string();
  }
}
