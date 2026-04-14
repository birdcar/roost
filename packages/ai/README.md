# @roostjs/ai

Agent base class, RAG pipeline, and AI Gateway support for Cloudflare Workers AI.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/ai
```

## Quick Start

```typescript
import { Agent, Model, AiServiceProvider } from '@roostjs/ai';

@Model('@cf/meta/llama-3.1-8b-instruct')
class SupportAgent extends Agent {
  instructions() {
    return 'You are a helpful support assistant. Be concise.';
  }
}

// In your Application setup
app.register(CloudflareServiceProvider);
app.register(AiServiceProvider);

// In a handler
const agent = new SupportAgent();
const result = await agent.prompt('How do I reset my password?');
console.log(result.text);
```

## Features

- `Agent` base class with multi-turn conversation history, tool calling (up to `maxSteps` iterations), streaming via SSE, and async/queued inference
- `@Model`, `@MaxSteps`, `@MaxTokens`, `@Temperature`, `@Timeout` decorators for agent configuration
- `CloudflareAIProvider` — direct Workers AI binding; `GatewayAIProvider` — routes through AI Gateway with automatic session affinity headers and fallback to the direct provider on errors
- `AiServiceProvider` — registers providers and wires them up; use `ai.gateway.accountId` + `ai.gateway.gatewayId` config keys to enable the gateway path
- `Tool` interface for type-safe tool definitions with JSON schema generation
- `RAGPipeline` — ingest documents and query by semantic similarity using Vectorize
- `TextChunker` (fixed token window with overlap) and `SemanticChunker` (heading/paragraph-aware, falls back to text chunking for oversized segments)
- `EmbeddingPipeline` — wraps the AI binding for batch embedding; defaults to `@cf/baai/bge-base-en-v1.5`
- `Agent.fake()`, `RAGPipeline.fake()` — in-process fakes for tests with assertion helpers

## API

```typescript
// Agent
abstract class Agent {
  abstract instructions(): string
  async prompt(input, options?): Promise<PromptResult>
  async stream(input, options?): Promise<ReadableStream<Uint8Array>>

  static setProvider(provider)
  static fake(responses?)         // sets up test fake
  static restore()
  static assertPrompted(textOrFn)
  static assertNeverPrompted()
}

// Functional shorthand when you don't need a class
const helper = agent({ instructions: '...', tools?: [...], provider?: ... });
await helper.prompt('...');

// Tool interface
interface Tool {
  description(): string
  schema(s): Record<string, SchemaBuilder>
  handle(request: ToolRequest): Promise<string> | string
}

// RAG
new RAGPipeline(vectorStore, embeddingPipeline, chunker, config?)
pipeline.ingest(documents)          // chunks, embeds, inserts into Vectorize
pipeline.query(text)                // returns QueryResult[] sorted by score

new EmbeddingPipeline(aiClient, model?)
new TextChunker({ chunkSize?, overlapPercent? })
new SemanticChunker({ chunkSize?, overlapPercent? })

// Providers
new CloudflareAIProvider(aiClient)
new GatewayAIProvider({ accountId, gatewayId }, fallbackProvider)
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/ai](https://roost.birdcar.dev/docs/reference/ai)

## License

MIT
