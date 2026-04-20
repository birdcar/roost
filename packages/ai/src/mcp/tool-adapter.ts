import { schema as schemaBuilder, type SchemaBuilder } from '@roostjs/schema';
import type { Tool, ToolRequest } from '../tool.js';
import { toolToProviderTool } from '../tool.js';
import type { McpClient } from './client.js';
import type { McpToolDescriptor } from './types.js';

/**
 * Adapt a discovered MCP tool into a Roost `Tool` instance. The handler
 * invokes the remote server via the connected `McpClient`; the schema is
 * converted from JSON Schema back to the Roost `SchemaBuilder` shape.
 */
export function toolFromMcp(client: McpClient, mcpTool: McpToolDescriptor): Tool {
  return {
    name(): string {
      return mcpTool.name;
    },
    description(): string {
      return mcpTool.description ?? '';
    },
    schema(s: typeof schemaBuilder): Record<string, SchemaBuilder> {
      return jsonSchemaToBuilderMap(s, mcpTool.inputSchema);
    },
    async handle(request: ToolRequest): Promise<string> {
      const args = toPlainObject(request);
      const result = await client.callTool(mcpTool.name, args);
      if (typeof result.content === 'string') return result.content;
      return JSON.stringify(result.content ?? '');
    },
  };
}

/**
 * Convert a Roost `Tool` into an MCP tool descriptor for publishing through
 * `McpAgent` / `createMcpHandler`. The parameters block is already JSON Schema
 * because `toolToProviderTool` normalises the SchemaBuilder output.
 */
export function mcpToolFromRoost(tool: Tool): McpToolDescriptor {
  const provider = toolToProviderTool(tool);
  return {
    name: provider.name,
    description: provider.description,
    inputSchema: provider.parameters as unknown as Record<string, unknown>,
  };
}

interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

function jsonSchemaToBuilderMap(
  s: typeof schemaBuilder,
  schema: Record<string, unknown> | undefined,
): Record<string, SchemaBuilder> {
  if (!schema) return {};
  const root = schema as JsonSchemaNode;
  if (root.type !== 'object' || !root.properties) return {};
  const out: Record<string, SchemaBuilder> = {};
  for (const [key, propSchema] of Object.entries(root.properties)) {
    out[key] = jsonSchemaToBuilder(s, propSchema);
  }
  return out;
}

function jsonSchemaToBuilder(s: typeof schemaBuilder, node: JsonSchemaNode): SchemaBuilder {
  const type = Array.isArray(node.type) ? node.type[0] : node.type;
  let builder: SchemaBuilder;
  switch (type) {
    case 'string':
      builder = s.string();
      break;
    case 'integer':
      builder = s.integer();
      break;
    case 'number':
      builder = s.number();
      break;
    case 'boolean':
      builder = s.boolean();
      break;
    case 'array': {
      const arr = s.array();
      builder = node.items ? arr.items(jsonSchemaToBuilder(s, node.items)) : arr;
      break;
    }
    case 'object': {
      let obj = s.object();
      if (node.properties) {
        const requiredSet = new Set(node.required ?? []);
        for (const [k, v] of Object.entries(node.properties)) {
          obj = obj.property(k, jsonSchemaToBuilder(s, v), requiredSet.has(k));
        }
      }
      builder = obj;
      break;
    }
    default:
      builder = s.string();
  }
  return node.description ? builder.description(node.description) : builder;
}

function toPlainObject(request: ToolRequest): Record<string, unknown> {
  const plain: Record<string, unknown> = {};
  for (const key of Object.keys(request)) {
    if (key === 'get') continue;
    plain[key] = (request as Record<string, unknown>)[key];
  }
  return plain;
}
