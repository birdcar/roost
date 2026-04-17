import { schema as schemaBuilder, type SchemaBuilder, type JsonSchemaOutput } from '@roostjs/schema';

export interface ToolRequest {
  [key: string]: unknown;
  get<T>(key: string): T;
}

export interface Tool {
  /**
   * Optional name override. When omitted, the tool's class name is used
   * (Laravel-style default). Provider requests use this as the function name.
   */
  name?(): string;
  description(): string;
  schema(s: typeof schemaBuilder): Record<string, SchemaBuilder>;
  handle(request: ToolRequest): Promise<string> | string;
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
  return tool.name?.() ?? (tool.constructor as { name: string }).name;
}
