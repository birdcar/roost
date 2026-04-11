import type { McpTool } from './tool.js';
import type { McpResource } from './resource.js';
import type { McpPrompt } from './prompt.js';
import { McpResponse } from './response.js';
import { createMcpRequest } from './request.js';

export abstract class McpServer {
  abstract tools: Array<new () => McpTool>;
  abstract resources: Array<new () => McpResource>;
  abstract prompts: Array<new () => McpPrompt>;

  serverName(): string { return this.constructor.name; }
  serverVersion(): string { return '1.0.0'; }
  serverInstructions(): string { return ''; }

  private resolveTools(): McpTool[] {
    return this.tools
      .map((T) => new T())
      .filter((t) => t.shouldRegister?.() !== false);
  }

  private resolveResources(): McpResource[] {
    return this.resources
      .map((R) => new R())
      .filter((r) => r.shouldRegister?.() !== false);
  }

  private resolvePrompts(): McpPrompt[] {
    return this.prompts
      .map((P) => new P())
      .filter((p) => p.shouldRegister?.() !== false);
  }

  listTools() {
    return this.resolveTools().map((t) => t.getDefinition());
  }

  listResources() {
    return this.resolveResources().map((r) => r.getDefinition());
  }

  listPrompts() {
    return this.resolvePrompts().map((p) => p.getDefinition());
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpResponse> {
    const tool = this.resolveTools().find((t) => t.getDefinition().name === name);
    if (!tool) return McpResponse.error(`Tool "${name}" not found`);

    const request = createMcpRequest(args);
    return tool.handle(request);
  }

  async readResource(uri: string): Promise<McpResponse> {
    const resource = this.resolveResources().find((r) => r.uri() === uri);
    if (!resource) return McpResponse.error(`Resource "${uri}" not found`);

    const request = createMcpRequest({}, uri);
    return resource.handle(request);
  }

  async runPrompt(name: string, args: Record<string, unknown>): Promise<McpResponse | McpResponse[]> {
    const prompt = this.resolvePrompts().find((p) => p.getDefinition().name === name);
    if (!prompt) return McpResponse.error(`Prompt "${name}" not found`);

    const request = createMcpRequest(args);
    return prompt.handle(request);
  }

  static tool<T extends McpTool>(
    ToolClass: new () => T,
    args: Record<string, unknown>
  ): Promise<McpResponse> {
    const tool = new ToolClass();
    const request = createMcpRequest(args);
    return Promise.resolve(tool.handle(request));
  }
}
