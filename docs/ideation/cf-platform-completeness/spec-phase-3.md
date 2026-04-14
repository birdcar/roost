# Phase 3 Spec: RAG Pipeline + AI Search MCP Integration

**Created**: 2026-04-14
**Status**: Draft
**Blocked By**: Phase 2 (requires `AIClient` from `@roostjs/cloudflare` and `VectorStore` from `@roostjs/cloudflare`)
**Packages Modified**: `@roostjs/ai`, `@roostjs/mcp`

---

## Overview

Phase 3 delivers two things: a `RAGPipeline` class in `@roostjs/ai` that handles the full document-to-retrieval lifecycle (chunking, embedding, vector storage, query), and an `AiSearchResource` in `@roostjs/mcp` that wraps a Cloudflare AI Search binding as an MCP-queryable resource.

Neither feature requires changes to existing classes. Both follow patterns already established in the codebase.

---

## Technical Approach

### RAGPipeline

The pipeline is composed of three single-responsibility classes that can be used independently or chained through `RAGPipeline`:

- `Chunker` (abstract) — splits a `Document` into `Chunk[]`. Two implementations: `TextChunker` (fixed-size token window with overlap) and `SemanticChunker` (boundary-aware: splits on headings and blank lines before falling back to size).
- `EmbeddingPipeline` — calls `AIClient.run()` with a configurable embedding model and returns `number[][]` aligned to the input chunk array.
- `RAGPipeline` — orchestrates ingest (`ingest(documents)`) and retrieval (`query(text)`). Delegates to an injected `Chunker` and `EmbeddingPipeline`, then calls `VectorStore.insert()` / `VectorStore.query()`.

All three accept their dependencies via constructor injection. `RAGPipeline` exposes a static `.fake()` method following the same `WeakMap`-based pattern used by `Agent`.

### AiSearchResource

`AiSearchResource` extends `McpResource` and wraps a Cloudflare AI Search binding. Because AI Search is a managed RAG service that exposes an HTTP-like query interface, the resource:

- Overrides `uri()` to return `aisearch://{instance-name}` (instance name passed at construction).
- Implements `handle(request)` to call the AI Search binding with a query string extracted from `request.params`, plus optional metadata and path filters.
- Returns `McpResponse.structured()` with the AI Search response payload so callers get typed fields (answer, sources, citations).

The AI Search binding type (`AiSearch`) must be present in the worker's `Env` and passed in at construction — same pattern as `VectorStore(index)` and `AIClient(ai)`.

---

## Feedback Strategy

Both deliverables are opt-in. No existing behavior changes. Failure modes are local (thrown errors, no silent degradation). Tests use fakes, no live CF bindings required.

---

## File Changes

### New files

```
packages/ai/src/rag/types.ts
packages/ai/src/rag/chunker.ts
packages/ai/src/rag/embedding-pipeline.ts
packages/ai/src/rag/pipeline.ts
packages/ai/src/rag/index.ts
packages/mcp/src/resources/ai-search.ts
```

### Modified files

```
packages/ai/src/index.ts          — re-export from ./rag/index.js
packages/mcp/src/index.ts         — re-export AiSearchResource
```

---

## Implementation Details

### `packages/ai/src/rag/types.ts`

```typescript
export interface Document {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface Chunk {
  id: string;           // `${document.id}:${chunkIndex}`
  documentId: string;
  text: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkVector {
  chunk: Chunk;
  embedding: number[];
}

export interface QueryResult {
  chunk: Chunk;
  score: number;
}

export interface RAGPipelineConfig {
  chunkSize?: number;        // default: 400
  overlapPercent?: number;   // default: 0.10
  embeddingModel?: string;   // default: '@cf/baai/bge-base-en-v1.5'
  topK?: number;             // default: 5
  similarityThreshold?: number; // default: 0.75
  namespace?: string;        // Vectorize namespace for multi-tenancy
}
```

Key constraints:
- `Chunk.id` must be stable and unique for upsert semantics. Use `${document.id}:${index}`.
- `tokenCount` is an approximation: `Math.ceil(text.length / 4)` (4 chars per token heuristic). Actual tokenization is not available in Workers.
- `metadata` from the parent `Document` is shallow-copied onto each `Chunk` so Vectorize filters can match document-level metadata at retrieval time.

---

### `packages/ai/src/rag/chunker.ts`

```typescript
export abstract class Chunker {
  abstract chunk(document: Document): Chunk[];
}

export class TextChunker extends Chunker { ... }
export class SemanticChunker extends Chunker { ... }
```

**TextChunker**

- Splits `document.text` into word-token windows of `chunkSize` tokens with `overlapPercent` overlap.
- Overlap is implemented by re-including the last `Math.floor(chunkSize * overlapPercent)` tokens of the previous chunk at the start of the next.
- Does not split mid-word. Tokenization unit is whitespace-split words; token count is estimated as `word.length / 4` rounded up, summed per word.
- Constructor: `new TextChunker({ chunkSize?: number, overlapPercent?: number })`, defaults from `RAGPipelineConfig`.

**SemanticChunker**

- First splits on Markdown heading lines (`/^#{1,6}\s/`) and double-newlines (`\n\n`). Each resulting segment is a candidate chunk.
- If a segment exceeds `chunkSize`, delegates to `TextChunker` to sub-chunk it with the same overlap setting.
- Segments shorter than `chunkSize * 0.1` tokens are merged with the next segment before the size check (avoids degenerate single-line chunks).
- Constructor: same signature as `TextChunker`.

Both chunkers copy `document.metadata` onto each produced `Chunk`.

---

### `packages/ai/src/rag/embedding-pipeline.ts`

```typescript
export class EmbeddingPipeline {
  constructor(
    private client: AIClient,
    private model = '@cf/baai/bge-base-en-v1.5'
  ) {}

  async embed(texts: string[]): Promise<number[][]> { ... }
}
```

- Calls `this.client.run<{ data: number[][] }>(this.model, { text: texts })`.
- Returns `result.data` — the Workers AI embedding response shape for BGE models.
- Throws `EmbeddingError` (typed subclass of `Error`) if `result.data` is missing or the returned array length does not match `texts.length`.
- Does not batch internally — Workers AI handles the array. If texts is empty, returns `[]` immediately.

---

### `packages/ai/src/rag/pipeline.ts`

```typescript
export class RAGPipeline {
  constructor(
    private store: VectorStore,
    private embeddings: EmbeddingPipeline,
    private chunker: Chunker,
    private config: RAGPipelineConfig = {}
  ) {}

  async ingest(documents: Document[]): Promise<{ inserted: number }> { ... }
  async query(text: string): Promise<QueryResult[]> { ... }

  static fake(responses?: QueryResult[][]): void { ... }
  static restore(): void { ... }
  static assertIngested(predicate?: (docs: Document[]) => boolean): void { ... }
  static assertQueried(predicate?: (text: string) => boolean): void { ... }
}
```

**`ingest(documents)`**

1. For each document, call `this.chunker.chunk(document)` → `Chunk[]`.
2. Collect all chunk texts, call `this.embeddings.embed(texts)` → `number[][]`.
3. Zip chunks and embeddings into `VectorizeVector[]`:
   - `id`: `chunk.id`
   - `values`: embedding array
   - `namespace`: `config.namespace` if set
   - `metadata`: `{ ...chunk.metadata, documentId: chunk.documentId, text: chunk.text }`
4. Call `this.store.insert(vectors)`.
5. Return `{ inserted: vectors.length }`.

Metadata must include `text` so that retrieved vectors can be returned as `QueryResult` without a second fetch.

**`query(text)`**

1. Embed the query: `this.embeddings.embed([text])` → `[queryVector]`.
2. Call `this.store.query(queryVector, { topK: config.topK ?? 5, namespace: config.namespace, returnMetadata: 'all' })`.
3. Filter matches where `match.score >= (config.similarityThreshold ?? 0.75)`.
4. Map surviving matches to `QueryResult`:
   - Reconstruct `Chunk` from `match.metadata` (text, documentId, id, tokenCount estimated, metadata remainder).
   - `score`: `match.score`.
5. Return sorted descending by score.

**Fake pattern**

Same `WeakMap<Function, RAGPipelineFake>` pattern as `Agent`:

```typescript
const fakes = new WeakMap<typeof RAGPipeline, RAGPipelineFake>();

class RAGPipelineFake {
  ingestedBatches: Document[][] = [];
  queriedTexts: string[] = [];
  private responses: QueryResult[][];
  private responseIndex = 0;

  recordIngest(docs: Document[]): void { ... }
  recordQuery(text: string): void { ... }
  nextQueryResponse(): QueryResult[] { ... }
}
```

When a fake is active, `ingest()` records the call and returns `{ inserted: 0 }`. `query()` records the text and returns the next canned `QueryResult[]`.

`assertIngested(predicate?)` checks `ingestedBatches` — passes if any batch matches. If no predicate, passes if any ingest was recorded.
`assertQueried(predicate?)` checks `queriedTexts` similarly.

---

### `packages/ai/src/rag/index.ts`

Exports:
```typescript
export { Chunker, TextChunker, SemanticChunker } from './chunker.js';
export { EmbeddingPipeline } from './embedding-pipeline.js';
export { RAGPipeline } from './pipeline.js';
export type { Document, Chunk, ChunkVector, QueryResult, RAGPipelineConfig } from './types.js';
```

---

### `packages/mcp/src/resources/ai-search.ts`

```typescript
export interface AiSearchQuery {
  query: string;
  metadataFilters?: Record<string, string>;
  pathFilters?: string[];
}

export interface AiSearchResult {
  answer: string;
  sources: Array<{
    url: string;
    title?: string;
    excerpt?: string;
  }>;
}

export class AiSearchResource extends McpResource {
  constructor(
    private binding: AiSearch,
    private instanceName: string
  ) {
    super();
  }

  uri(): string {
    return `aisearch://${this.instanceName}`;
  }

  mimeType(): string {
    return 'application/json';
  }

  description(): string {
    return `AI Search instance "${this.instanceName}". Query with { query, metadataFilters?, pathFilters? }.`;
  }

  async handle(request: McpRequest): Promise<McpResponse> { ... }
}
```

**`handle(request)`**

1. Extract `query = request.get<string>('query')`. If missing or empty, return `McpResponse.error('query is required')`.
2. Build the AI Search request object:
   ```typescript
   {
     query,
     ...(metadataFilters ? { metadata_filters: metadataFilters } : {}),
     ...(pathFilters?.length ? { path_filters: pathFilters } : {}),
   }
   ```
3. Call `this.binding.run(searchRequest)` (the AI Search binding follows the `Ai.run()` interface shape).
4. If the response has an `answer` field, return `McpResponse.structured({ answer, sources })`.
5. If the binding throws, catch and return `McpResponse.error(err.message)`.

**`shouldRegister()`**

Returns `true` unconditionally (registration gate is at construction — if the caller instantiated the resource, they have the binding).

**Registering in a server**

`AiSearchResource` cannot use the `Array<new () => McpResource>` pattern directly because it requires constructor arguments. The pattern is to subclass per instance:

```typescript
// In app code (not in the package):
class MyAiSearch extends AiSearchResource {
  constructor() {
    super(env.AI_SEARCH, 'my-docs');
  }
}

class MyMcpServer extends McpServer {
  resources = [MyAiSearch];
  // ...
}
```

Document this pattern in the resource's JSDoc.

Alternatively, register ad-hoc via `McpServer.readResource()` by calling `new AiSearchResource(binding, name)` directly outside the server array. Both patterns are valid.

---

### Modifications to `packages/ai/src/index.ts`

Add after the existing exports:

```typescript
export {
  Chunker,
  TextChunker,
  SemanticChunker,
  EmbeddingPipeline,
  RAGPipeline,
} from './rag/index.js';
export type {
  Document,
  Chunk,
  ChunkVector,
  QueryResult,
  RAGPipelineConfig,
} from './rag/index.js';
```

### Modifications to `packages/mcp/src/index.ts`

Add:

```typescript
export { AiSearchResource } from './resources/ai-search.js';
export type { AiSearchQuery, AiSearchResult } from './resources/ai-search.js';
```

---

## Testing Requirements

### `packages/ai` tests

File: `packages/ai/src/rag/__tests__/chunker.test.ts`

- `TextChunker` splits text into chunks no larger than `chunkSize` tokens
- `TextChunker` overlap: the last N tokens of chunk N appear at the start of chunk N+1
- `TextChunker` on empty string returns `[]`
- `TextChunker` on text shorter than `chunkSize` returns one chunk
- `SemanticChunker` splits at `##` headings
- `SemanticChunker` splits at double newlines
- `SemanticChunker` delegates to `TextChunker` when a segment exceeds `chunkSize`
- `SemanticChunker` merges sub-threshold segments with the next

File: `packages/ai/src/rag/__tests__/embedding-pipeline.test.ts`

- `embed([])` returns `[]` without calling `AIClient`
- `embed(['a', 'b'])` calls `AIClient.run` with the configured model and `{ text: ['a', 'b'] }`
- Throws `EmbeddingError` when `result.data` is undefined
- Throws `EmbeddingError` when returned array length mismatches input length

File: `packages/ai/src/rag/__tests__/pipeline.test.ts`

- `ingest()` calls chunker, embedding pipeline, and VectorStore.insert in sequence
- `ingest()` stores chunk text in vector metadata
- `query()` embeds the query and calls VectorStore.query with configured topK and namespace
- `query()` filters results below similarityThreshold
- `query()` returns results sorted by score descending
- `RAGPipeline.fake()` — `ingest()` records calls without calling real dependencies
- `RAGPipeline.fake()` — `query()` returns canned responses in order
- `RAGPipeline.assertIngested()` passes when ingest was called
- `RAGPipeline.assertQueried('needle')` passes when query text includes 'needle'
- `RAGPipeline.restore()` clears the fake

Use vitest. Mock `AIClient` and `VectorStore` with simple objects satisfying the interface — no CF runtime required.

### `packages/mcp` tests

File: `packages/mcp/src/resources/__tests__/ai-search.test.ts`

- `uri()` returns `aisearch://my-index`
- `mimeType()` returns `application/json`
- `handle()` returns error when `query` param is missing
- `handle()` returns error when `query` param is empty string
- `handle()` calls binding with query and no filters when only query provided
- `handle()` forwards metadataFilters to binding when present
- `handle()` forwards pathFilters to binding when present
- `handle()` returns `McpResponse.structured()` with answer and sources on success
- `handle()` returns `McpResponse.error()` when binding throws

Mock the `AiSearch` binding with a plain object: `{ run: vi.fn() }`.

---

## Error Handling

| Location | Condition | Behavior |
|---|---|---|
| `EmbeddingPipeline.embed` | `result.data` missing | throw `EmbeddingError('No embedding data returned from model')` |
| `EmbeddingPipeline.embed` | length mismatch | throw `EmbeddingError('Embedding count mismatch: expected N, got M')` |
| `RAGPipeline.ingest` | `VectorStore.insert` throws | propagate — caller decides retry/log |
| `RAGPipeline.query` | no results above threshold | return `[]` — not an error |
| `RAGPipeline.query` | `VectorStore.query` throws | propagate |
| `AiSearchResource.handle` | missing `query` param | return `McpResponse.error('query is required')` |
| `AiSearchResource.handle` | binding throws | catch, return `McpResponse.error(err.message)` |

`EmbeddingError` is defined in `packages/ai/src/rag/types.ts`:

```typescript
export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}
```

No silent swallowing anywhere. Errors that originate in CF bindings surface to the caller with the original message preserved.

---

## Failure Modes

**Vectorize namespace mismatch** — if `config.namespace` is set for ingest but omitted for query (or vice versa), results will be wrong. `RAGPipeline` does not validate this. Document it clearly in the config interface JSDoc.

**Embedding model dimensionality** — BGE-base-en-v1.5 produces 768-dimensional vectors. If the Vectorize index was created with a different dimension count, `VectorStore.insert()` will throw a CF error. `EmbeddingPipeline` does not know the index dimension. Document in the config that the index must match the model.

**AI Search binding shape** — The CF AI Search binding API may not exactly match `ai.run()`. If the binding exposes a different method (e.g., `.query()` instead of `.run()`), `AiSearchResource.handle()` must be adjusted. The spec uses `.run()` as the assumed interface based on the Workers AI binding convention. Verify against actual CF docs before implementing.

**Large document ingest** — Workers have a 30s CPU limit. Very large documents with hundreds of chunks may exceed this. `RAGPipeline.ingest()` does not batch by default. If needed, callers should split document arrays and call `ingest()` in chunks using `ctx.waitUntil()` (available via Phase 1's `app.defer()`).

**SemanticChunker edge cases** — Documents with no headings and no double newlines degrade to a single segment, then fall through to `TextChunker`. This is intentional. Documents that are a single very long line with no whitespace will produce a single oversized chunk (word-split chunking requires whitespace). Document this limitation.

---

## Wrangler Configuration

`AiSearchResource` requires the AI Search binding in `wrangler.jsonc`. No new wrangler config is required for `RAGPipeline` beyond the existing Vectorize and AI bindings from Phase 2.

Scaffold comment to add in `wrangler.jsonc` template (not added by this phase — document for users):

```jsonc
// AI Search (optional — required for AiSearchResource in @roostjs/mcp)
// "ai_search": [
//   { "binding": "AI_SEARCH", "index_name": "your-index-name" }
// ]
```

---

## Validation Commands

```bash
bun test --filter ai
bun test --filter mcp
bun run typecheck
```

All three must pass with no new type errors before this phase is considered complete.
