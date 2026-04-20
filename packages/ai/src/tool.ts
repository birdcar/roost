import { schema as schemaBuilder, type SchemaBuilder, type JsonSchemaOutput } from '@roostjs/schema';
import type { Lab } from './enums.js';

export interface ToolRequest {
  [key: string]: unknown;
  get<T>(key: string): T;
}

export interface Tool {
  /**
   * Optional name override. When omitted, the tool's class name is kebab-cased
   * and used as the function name in provider requests.
   */
  name?(): string;
  description(): string;
  schema(s: typeof schemaBuilder): Record<string, SchemaBuilder>;
  handle(request: ToolRequest): Promise<string> | string;
}

/**
 * Provider-native tools (web search, web fetch, file search) that run inside
 * the provider and are addressed via special markers in the request body
 * rather than dispatched through our tool loop.
 */
export interface ProviderTool {
  readonly kind: 'provider';
  readonly name: string;
  toRequest(provider: Lab | string): Record<string, unknown>;
}

export class UnsupportedProviderToolError extends Error {
  override readonly name = 'UnsupportedProviderToolError';
  constructor(toolName: string, provider: Lab | string) {
    super(`Provider tool '${toolName}' is not supported by ${provider}.`);
  }
}

export class ProviderToolNameCollisionError extends Error {
  override readonly name = 'ProviderToolNameCollisionError';
  constructor(toolName: string) {
    super(
      `User-defined tool '${toolName}' collides with provider tool '${toolName}'. Rename one of them or override Tool.name().`,
    );
  }
}

export function createToolRequest(args: Record<string, unknown>): ToolRequest {
  return {
    ...args,
    get<T>(key: string): T {
      return args[key] as T;
    },
  };
}

export function toolToProviderTool(tool: Tool): { name: string; description: string; parameters: JsonSchemaOutput } {
  const schemaMap = tool.schema(schemaBuilder);

  const properties: Record<string, JsonSchemaOutput> = {};
  const required: string[] = [];

  for (const [key, builder] of Object.entries(schemaMap)) {
    properties[key] = builder.build();
    required.push(key);
  }

  return {
    name: resolveToolName(tool),
    description: tool.description(),
    parameters: {
      type: 'object',
      properties,
      required,
    },
  };
}

export function resolveToolName(tool: Tool): string {
  const explicit = tool.name?.();
  if (explicit) return explicit;
  return toKebabCase((tool.constructor as { name: string }).name);
}

export function isProviderTool(value: unknown): value is ProviderTool {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'provider';
}

/**
 * Tool factories. Namespaced as `Tool.fromMcp(client, descriptor)` so consumers
 * can inject a discovered MCP tool into any agent's `tools()` list without
 * importing from the `@roostjs/ai/mcp` subpath directly.
 */
export const Tool = {
  async fromMcp(client: import('./mcp/client.js').McpClient, descriptor: import('./mcp/types.js').McpToolDescriptor): Promise<Tool> {
    const mod = await import('./mcp/tool-adapter.js');
    return mod.toolFromMcp(client, descriptor);
  },
};

/**
 * Split a mixed tool array into user-defined tools (run by our tool loop) and
 * provider-native tools (encoded as request markers). Rejects collisions where
 * a user tool resolves to the same name as a provider tool.
 */
export function partitionTools(
  tools: Array<Tool | ProviderTool>,
): { userTools: Tool[]; providerTools: ProviderTool[] } {
  const userTools: Tool[] = [];
  const providerTools: ProviderTool[] = [];
  for (const t of tools) {
    if (isProviderTool(t)) providerTools.push(t);
    else userTools.push(t);
  }
  const providerNames = new Set(providerTools.map((p) => p.name));
  for (const t of userTools) {
    const name = resolveToolName(t);
    if (providerNames.has(name)) throw new ProviderToolNameCollisionError(name);
  }
  return { userTools, providerTools };
}

function toKebabCase(input: string): string {
  if (!input) return input;
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
