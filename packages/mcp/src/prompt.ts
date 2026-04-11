import type { McpRequest, McpPromptDefinition } from './types.js';
import type { McpResponse } from './response.js';

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export abstract class McpPrompt {
  abstract description(): string;
  abstract handle(request: McpRequest): Promise<McpResponse | McpResponse[]> | McpResponse | McpResponse[];

  arguments(): PromptArgument[] {
    return [];
  }

  shouldRegister?(): boolean;

  getDefinition(): McpPromptDefinition {
    return {
      name: this.constructor.name.replace(/Prompt$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
      description: this.description(),
      arguments: this.arguments(),
    };
  }
}
