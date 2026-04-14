# @roostjs/mcp

Model Context Protocol server framework for Cloudflare Workers.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/mcp
```

## Quick Start

```typescript
import { McpServer, McpTool, McpResponse } from '@roostjs/mcp';
import { schema } from '@roostjs/schema';

class SearchTool extends McpTool {
  description() { return 'Search the knowledge base'; }

  schema(s: typeof schema) {
    return { query: s.string().describe('Search query') };
  }

  async handle(request) {
    const query = request.get<string>('query');
    const results = await db.search(query);
    return McpResponse.structured({ results });
  }
}

class MyMcpServer extends McpServer {
  tools = [SearchTool];
  resources = [];
  prompts = [];
}
```

## Features

- `McpServer` base class with `tools`, `resources`, and `prompts` arrays
- `McpTool` with schema-first input validation via `@roostjs/schema`
- `McpResource` for exposing data sources — URI derived from class name by default
- `McpPrompt` for reusable prompt templates
- `McpResponse` factory methods: `text()`, `structured()`, `image()`, `audio()`, `error()`
- `AiSearchResource` for first-class Cloudflare AI Search binding integration
- `shouldRegister()` hook on all primitives for conditional registration

## AiSearchResource

Wraps a Cloudflare AI Search binding as an MCP resource. Because it requires constructor arguments, subclass it for use in `McpServer.resources`:

```typescript
import { AiSearchResource, McpServer } from '@roostjs/mcp';

class DocsSearch extends AiSearchResource {
  constructor() {
    super(env.AI_SEARCH, 'my-docs');
  }
}

class MyMcpServer extends McpServer {
  tools = [];
  resources = [DocsSearch];
  prompts = [];
}
```

## API

```typescript
abstract class McpServer {
  abstract tools: Array<new () => McpTool>
  abstract resources: Array<new () => McpResource>
  abstract prompts: Array<new () => McpPrompt>

  serverName(): string
  serverVersion(): string
  serverInstructions(): string

  callTool(name: string, args: Record<string, unknown>): Promise<McpResponse>
  readResource(uri: string): Promise<McpResponse>
  runPrompt(name: string, args: Record<string, unknown>): Promise<McpResponse | McpResponse[]>
  listTools(): McpToolDefinition[]
  listResources(): McpResourceDefinition[]
  listPrompts(): McpPromptDefinition[]
}

abstract class McpTool {
  abstract description(): string
  abstract schema(s: typeof schema): Record<string, SchemaBuilder>
  abstract handle(request: McpRequest): Promise<McpResponse> | McpResponse
  shouldRegister?(): boolean
}

abstract class McpResource {
  abstract description(): string
  abstract handle(request: McpRequest): Promise<McpResponse> | McpResponse
  uri(): string        // defaults to kebab-case class name minus "Resource"
  mimeType(): string   // defaults to "text/plain"
  shouldRegister?(): boolean
}

abstract class McpPrompt {
  abstract description(): string
  abstract handle(request: McpRequest): Promise<McpResponse | McpResponse[]>
  arguments(): PromptArgument[]
  shouldRegister?(): boolean
}

class McpResponse {
  static text(text: string): McpResponse
  static structured(content: Record<string, unknown>): McpResponse
  static image(data: string, mimeType: string): McpResponse
  static audio(data: string, mimeType: string): McpResponse
  static error(message: string): McpResponse
  withMeta(meta: Record<string, unknown>): this
}
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/mcp](https://roost.birdcar.dev/docs/reference/mcp)

## License

MIT
