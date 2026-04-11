import type { McpRequest, McpResourceDefinition } from './types.js';
import type { McpResponse } from './response.js';

export abstract class McpResource {
  abstract description(): string;
  abstract handle(request: McpRequest): Promise<McpResponse> | McpResponse;

  uri(): string {
    return this.constructor.name.replace(/Resource$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);
  }

  mimeType(): string {
    return 'text/plain';
  }

  shouldRegister?(): boolean;

  getDefinition(): McpResourceDefinition {
    return {
      uri: this.uri(),
      name: this.constructor.name,
      description: this.description(),
      mimeType: this.mimeType(),
    };
  }
}
