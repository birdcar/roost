import { schema as schemaBuilder, type SchemaBuilder } from '@roost/schema';
import type { McpRequest, McpToolDefinition } from './types.js';
import type { McpResponse } from './response.js';

export abstract class McpTool {
  abstract description(): string;
  abstract schema(s: typeof schemaBuilder): Record<string, SchemaBuilder>;
  abstract handle(request: McpRequest): Promise<McpResponse> | McpResponse;

  outputSchema?(s: typeof schemaBuilder): Record<string, SchemaBuilder>;

  shouldRegister?(): boolean;

  getDefinition(): McpToolDefinition {
    const schemaMap = this.schema(schemaBuilder);

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, builder] of Object.entries(schemaMap)) {
      properties[key] = builder.build();
      required.push(key);
    }

    return {
      name: this.constructor.name.replace(/Tool$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
      description: this.description(),
      inputSchema: { type: 'object', properties, required },
    };
  }
}
