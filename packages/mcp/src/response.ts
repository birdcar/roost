import type { McpResponseContent } from './types.js';

export class McpResponse {
  private contents: McpResponseContent[] = [];
  private _meta?: Record<string, unknown>;

  private constructor(content?: McpResponseContent) {
    if (content) this.contents.push(content);
  }

  static text(text: string): McpResponse {
    return new McpResponse({ type: 'text', text });
  }

  static error(message: string): McpResponse {
    return new McpResponse({ type: 'error', text: message, isError: true });
  }

  static image(data: string, mimeType: string): McpResponse {
    return new McpResponse({ type: 'image', data, mimeType });
  }

  static audio(data: string, mimeType: string): McpResponse {
    return new McpResponse({ type: 'audio', data, mimeType });
  }

  static structured(content: Record<string, unknown>): McpResponse {
    return new McpResponse({ type: 'structured', structuredContent: content });
  }

  withMeta(meta: Record<string, unknown>): this {
    this._meta = { ...this._meta, ...meta };
    return this;
  }

  toJSON(): { content: McpResponseContent[]; _meta?: Record<string, unknown> } {
    return {
      content: this.contents,
      ...(this._meta ? { _meta: this._meta } : {}),
    };
  }
}
