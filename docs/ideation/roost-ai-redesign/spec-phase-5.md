# Implementation Spec: Roost AI Redesign - Phase 5 (RAG + Files + Vector Stores + Reranking)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation), Phase 4 (Tools + Attachments)
**Estimated Effort**: L

## Technical Approach

Phase 5 completes the RAG story. `EmbeddingPipeline` gains a KV-backed cache (default 30d TTL) and a `Str.toEmbeddings()` convenience helper. `RAGPipeline` gains namespace isolation and metadata filters on query. `Files` gets the first-class resource API (`Files.store(file)`, `Files.fromId()`, `Files.get/delete`) routing to provider file storage (OpenAI / Anthropic / Gemini). `Stores` wraps Vectorize (and provider vector stores where available) with the Laravel `Stores::create/get/delete` + `.add/.remove` interface including metadata attachment. `Reranking` ships as a standalone class + a Collection macro, with Cohere and Jina routed via AI Gateway. Finally, `SimilaritySearch.usingModel()` integrates with `@roostjs/orm` — any model with a configured vector column becomes queryable via the agent tool.

Architecturally, we split these cleanly under `@roostjs/ai/rag`. Everything Vectorize-specific stays in the `rag` subpath so the root package remains lightweight. The Files and Stores APIs are provider-agnostic at the surface but use capability checks (`provider.capabilities().supported.has('files')`) before routing — fallbacks to the Roost-native Vectorize-backed implementation when providers don't support native Files/Stores.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/rag/`

**Playground**: Test suite. For Vectorize behavior, miniflare's Vectorize emulator. For KV caching, miniflare's KV.

**Why this approach**: RAG is data-heavy pure logic — tests are the tightest loop. Miniflare covers the edge cases (emulator behavior).

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/rag/embedding-cache.ts` | KV-backed cache wrapper |
| `packages/ai/src/rag/str-helper.ts` | `Str.toEmbeddings()` convenience |
| `packages/ai/src/rag/files/files.ts` | `Files` static API (`.store`, `.get`, `.delete`, `.fake`) |
| `packages/ai/src/rag/files/storage-providers.ts` | Per-provider Files API adapters (OpenAI, Anthropic, Gemini, R2-native fallback) |
| `packages/ai/src/rag/stores/stores.ts` | `Stores` static API (`.create`, `.get`, `.delete`, `.fake`) |
| `packages/ai/src/rag/stores/vector-store.ts` | `VectorStoreHandle` with `.add`, `.remove`, `.assertAdded`, `.assertRemoved` |
| `packages/ai/src/rag/stores/metadata.ts` | Metadata schema validation for store entries |
| `packages/ai/src/rag/reranking/reranking.ts` | `Reranking` static API (.of(docs).rerank(query)) |
| `packages/ai/src/rag/reranking/providers/cohere.ts` | Cohere reranker via AI Gateway |
| `packages/ai/src/rag/reranking/providers/jina.ts` | Jina reranker via AI Gateway |
| `packages/ai/src/rag/reranking/collection-macro.ts` | Array.prototype.rerank augmentation (opt-in) |
| `packages/ai/src/tools/similarity-search.ts` | `SimilaritySearch` tool + `.usingModel()` + custom closure |
| `packages/ai/src/rag/events.ts` | `GeneratingEmbeddings`, `EmbeddingsGenerated`, `FileStored`, `FileDeleted`, `CreatingStore`, `StoreCreated`, `AddingFileToStore`, `FileAddedToStore`, `RemovingFileFromStore`, `FileRemovedFromStore`, `Reranking`, `Reranked` |
| `packages/ai/src/rag/testing/fakes.ts` | `Files.fake()`, `Stores.fake()`, `Reranking.fake()`, `Embeddings.fake()` |
| `packages/ai/__tests__/rag/embedding-cache.test.ts` | Cache hit/miss, TTL, key hashing |
| `packages/ai/__tests__/rag/str-helper.test.ts` | `Str.toEmbeddings` with/without cache |
| `packages/ai/__tests__/rag/files.test.ts` | store/get/delete across providers; fake mode |
| `packages/ai/__tests__/rag/stores.test.ts` | create/delete; .add with metadata; .remove with deleteFile |
| `packages/ai/__tests__/rag/reranking.test.ts` | Cohere/Jina; limit; collection macro |
| `packages/ai/__tests__/rag/similarity-search.test.ts` | usingModel + closure modes; @roostjs/orm integration |
| `packages/ai/__tests__/integration/rag.miniflare.test.ts` | Vectorize emulator: insert, query with namespace + metadata filter |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/rag/embedding-pipeline.ts` | Inject optional `EmbeddingCache`; `embed()` checks cache first |
| `packages/ai/src/rag/pipeline.ts` | Add `namespace` + `filter` query options; emit new events |
| `packages/ai/src/rag/types.ts` | Add `FileRecord`, `StoreRecord`, `StorableFileMetadata`, `RerankResult` |
| `packages/ai/src/rag/index.ts` | Re-export new APIs |
| `packages/ai/src/providers/interface.ts` | Add optional `files`, `stores`, `rerank`, `embed` methods |
| `packages/ai/src/providers/*.ts` | Each provider implements its own files/stores/rerank where supported |
| `packages/ai/src/events.ts` | Re-export RAG events for convenience |

## Implementation Details

### 1. EmbeddingCache (KV-backed)

**Pattern to follow**: `packages/feature-flags/src/cache.ts` (KV caching pattern, if exists; otherwise `packages/cloudflare/src/kv-store.ts`).

**Overview**: Wraps any `KVStore` binding. Key derived from SHA-256 of provider + model + dimensions + input. TTL configurable (default 30 days).

```typescript
// packages/ai/src/rag/embedding-cache.ts
export class EmbeddingCache {
  constructor(private kv: KVStore, private ttlSeconds = 60 * 60 * 24 * 30) {}

  async get(key: EmbeddingCacheKey): Promise<number[] | null> {
    const hashed = await this.hashKey(key);
    const raw = await this.kv.get(`emb:${hashed}`, 'text');
    return raw ? JSON.parse(raw) : null;
  }

  async set(key: EmbeddingCacheKey, vector: number[], ttlSeconds?: number): Promise<void> {
    const hashed = await this.hashKey(key);
    await this.kv.put(`emb:${hashed}`, JSON.stringify(vector), { expirationTtl: ttlSeconds ?? this.ttlSeconds });
  }

  private async hashKey(key: EmbeddingCacheKey): Promise<string> {
    const canonical = `${key.provider}:${key.model}:${key.dimensions ?? 'default'}:${key.input}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
```

**Key decisions**:
- KV key hashed so arbitrary input length doesn't blow out key limit (512 bytes).
- `EmbeddingPipeline.embed(texts, { cache: true | seconds })` signature for per-call opt-in.
- Global cache config lives in `ai.caching.embeddings.{enabled, ttl, store}`.

**Implementation steps**:
1. Implement cache with hash-keyed KV.
2. Wire `EmbeddingPipeline` to check cache before provider call.
3. Per-text cache (not per-batch) to maximize reuse.
4. Support `cache: false` to bypass when global is enabled.

**Feedback loop**: `bun test packages/ai/__tests__/rag/embedding-cache.test.ts`

### 2. Str.toEmbeddings Helper

**Overview**: Attach helper to a `Str` namespace in `@roostjs/ai/rag` that generates embeddings for a single string.

```typescript
// packages/ai/src/rag/str-helper.ts
export const Str = {
  async toEmbeddings(text: string, opts?: { cache?: boolean | number; provider?: Lab }): Promise<number[]> {
    const pipeline = resolveEmbeddingPipeline(opts?.provider);
    const [vec] = await pipeline.embed([text], { cache: opts?.cache });
    return vec;
  },
};
```

**Implementation steps**: Thin wrapper delegating to pipeline.

### 3. RAGPipeline Namespace + Filter

**Pattern to follow**: Current `packages/ai/src/rag/pipeline.ts` query method.

**Overview**: Add `namespace` per-index-call and `filter` expression.

```typescript
async query(text: string, opts?: { namespace?: string; filter?: Record<string, unknown>; topK?: number; minSimilarity?: number }): Promise<QueryResult[]> {
  const [queryVector] = await this.embeddings.embed([text], { cache: true });
  const matches = await this.store.query(queryVector, {
    topK: opts?.topK ?? this.config.topK ?? 5,
    namespace: opts?.namespace ?? this.config.namespace,
    filter: opts?.filter,
    returnMetadata: 'all',
  });
  // Existing filter + map logic, unchanged
}
```

**Key decisions**:
- Namespace may be set at pipeline construction OR per-query; per-query wins.
- Filter is a plain object matched against vector metadata server-side by Vectorize.

### 4. Files API

**Pattern to follow**: Laravel `Laravel\Ai\Files\Document::fromPath()->put()`.

**Overview**: `Files` is a static namespace with methods that dispatch to provider-specific adapters based on `opts.provider`.

```typescript
// packages/ai/src/rag/files/files.ts
export const Files = {
  Image: ImageFileBuilder,        // re-export from P4 attachments
  Document: DocumentFileBuilder,

  // assertions:
  fake(): FilesFake { /* ... */ },
  assertStored(predicate: (file: StorableFile) => boolean): void,
  assertDeleted(fileId: string): void,
  assertNothingStored(): void,
};
```

File put/get/delete go through `StorableFile` (P4); this phase adds the provider routing + event dispatch + fake mode.

**Implementation steps**:
1. Factor provider storage adapters: `OpenAIFilesAdapter`, `AnthropicFilesAdapter`, `GeminiFilesAdapter`, `R2NativeFilesAdapter` (default when provider doesn't support Files).
2. `StorableFile.put({ provider })` resolves adapter, dispatches `StoringFile` + `FileStored`.
3. `Files.fake()` routes everything to in-memory adapter; records calls for assertions.

**Feedback loop**: `bun test packages/ai/__tests__/rag/files.test.ts`

### 5. Stores API

**Pattern to follow**: Laravel `Laravel\Ai\Stores::create`.

**Overview**: `Stores.create('name')` creates a vector store. On OpenAI/Gemini, uses the provider's native Stores API. On Workers AI + Vectorize, creates a namespaced index (a single Vectorize index per Roost app, with store IDs as namespaces).

```typescript
// packages/ai/src/rag/stores/stores.ts
export const Stores = {
  async create(name: string, opts?: { description?: string; expiresWhenIdleFor?: number; provider?: Lab }): Promise<VectorStoreHandle> { /* ... */ },
  async get(id: string, opts?: { provider?: Lab }): Promise<VectorStoreHandle> { /* ... */ },
  async delete(id: string): Promise<void> { /* ... */ },
  fake(): StoresFake { /* ... */ },
  assertCreated(name: string | ((name: string, desc?: string) => boolean)): void,
  // ...
};

export class VectorStoreHandle {
  constructor(public id: string, public name: string, public fileCounts: { total: number; ready: number }) {}

  async add(fileOrId: StorableFile | string | File, opts?: { metadata?: Record<string, unknown> }): Promise<DocumentRecord> { /* ... */ }
  async remove(fileId: string, opts?: { deleteFile?: boolean }): Promise<void> { /* ... */ }

  // Assertion helpers when Stores.fake() is active
  assertAdded(id: string | ((file: StorableFile) => boolean)): void,
  assertRemoved(id: string): void,
  assertNotAdded(id: string): void,
  assertNotRemoved(id: string): void,
}
```

**Key decisions**:
- Provider-native stores (OpenAI, Gemini) used when available; returned `VectorStoreHandle` wraps provider IDs.
- Workers AI + Vectorize fallback: one physical index, namespace-per-store.
- Metadata attached to Vectorize vectors or passed to provider's native metadata API.
- `expiresWhenIdleFor` supported on OpenAI; Vectorize fallback stores expiry + a cron cleanup (opt-in).

**Implementation steps**:
1. Implement `Stores` static API + `VectorStoreHandle`.
2. Implement adapters per provider.
3. Implement Vectorize namespace fallback adapter.
4. Implement `Stores.fake()` + per-store `assertAdded/assertRemoved`.

**Feedback loop**: `bun test packages/ai/__tests__/rag/stores.test.ts`

### 6. Reranking API

**Pattern to follow**: Laravel `Laravel\Ai\Reranking::of($docs)->rerank($query)`.

**Overview**: Supports Cohere and Jina via AI Gateway. Returns `RerankResult[]` with `{ index, document, score }`.

```typescript
// packages/ai/src/rag/reranking/reranking.ts
export const Reranking = {
  of(documents: string[] | Array<{ id: string; text: string }>): RerankingBuilder { /* ... */ },
  fake(responses?: RerankResult[][]): void,
  assertReranked(predicate: (prompt: RerankingPrompt) => boolean): void,
  assertNothingReranked(): void,
};

export class RerankingBuilder {
  limit(n: number): this { /* ... */ }
  async rerank(query: string, opts?: { provider?: Lab; model?: string }): Promise<RerankResult[]> {
    const provider = resolveReranker(opts?.provider ?? Lab.Cohere);
    const result = await provider.rerank({ query, documents: this.docs, limit: this.limit_ });
    dispatch(new Reranked(prompt, result));
    return result;
  }
  first(): Promise<RerankResult>;  // convenience
}

// Collection macro
Array.prototype.rerank = function<T>(by: keyof T | ((item: T) => string), query: string, opts?: RerankOptions): Promise<T[]> {
  const docs = this.map((item) => typeof by === 'function' ? by(item) : (item as any)[by]);
  const ranked = await Reranking.of(docs).rerank(query, opts);
  return ranked.map(r => this[r.index]);
};
```

**Key decisions**:
- Collection macro is opt-in (`import '@roostjs/ai/rag/reranking/collection-macro'`) to avoid global side effects.
- Cohere via Gateway path `rerank-english-v3.0`; Jina via `jina-reranker-v2-base-multilingual`.

**Implementation steps**:
1. Implement builder + static API.
2. Implement Cohere + Jina adapters (HTTP via Gateway).
3. Implement collection macro (opt-in).
4. Fake + assertions.

**Feedback loop**: `bun test packages/ai/__tests__/rag/reranking.test.ts`

### 7. SimilaritySearch Tool

**Pattern to follow**: Laravel `SimilaritySearch::usingModel(Document::class, 'embedding')`.

**Overview**: Agent tool that searches vector-columned models. Two modes: `.usingModel()` for `@roostjs/orm` models with a vector column, and a raw closure for custom queries.

```typescript
// packages/ai/src/tools/similarity-search.ts
export class SimilaritySearch implements Tool {
  static usingModel<M extends Model>(
    modelClass: new () => M,
    column: keyof M | string,
    opts?: { minSimilarity?: number; limit?: number; query?: (qb: QueryBuilder<M>) => QueryBuilder<M> },
  ): SimilaritySearch {
    return new SimilaritySearch({
      using: async (query: string) => {
        const qb = modelClass.query().whereVectorSimilarTo(column as string, query, {
          minSimilarity: opts?.minSimilarity ?? 0.5,
          limit: opts?.limit ?? 10,
        });
        return opts?.query ? opts.query(qb).get() : qb.get();
      },
    });
  }

  constructor(private opts: { using: (query: string) => Promise<unknown[]>; description?: string }) {}

  description(): string { return this.opts.description ?? 'Search knowledge base by semantic similarity'; }
  withDescription(desc: string): this { this.opts.description = desc; return this; }

  schema(s: typeof schema): Record<string, SchemaBuilder> {
    return { query: s.string().description('Natural language query') };
  }

  async handle(request: ToolRequest): Promise<string> {
    const results = await this.opts.using(request.get<string>('query'));
    return JSON.stringify(results.slice(0, 20));
  }
}
```

**Key decisions**:
- Depends on `@roostjs/orm` having `whereVectorSimilarTo` on its query builder — ensure that exists, or add it as a micro-PR against `@roostjs/orm`.
- Default description is meaningful; `withDescription` for customization matches Laravel.

**Implementation steps**:
1. Verify/add `whereVectorSimilarTo` on `@roostjs/orm` query builder (Vectorize-backed).
2. Implement `SimilaritySearch` with both constructor forms.
3. Integration test against real `@roostjs/orm` model with Vectorize emulator.

**Feedback loop**: `bun test packages/ai/__tests__/rag/similarity-search.test.ts`

### 8. Events Dispatch

Add events per the contract: `GeneratingEmbeddings`, `EmbeddingsGenerated`, `FileStored`, `FileDeleted`, `CreatingStore`, `StoreCreated`, `AddingFileToStore`, `FileAddedToStore`, `RemovingFileFromStore`, `FileRemovedFromStore`, `Reranking`, `Reranked`.

Each event extends `Event` from `@roostjs/events`. Dispatched at entry/exit of each RAG operation.

## Data Model

No schema changes. Vectorize index schema updated to include `store_id` in metadata for namespace-backed stores. Optional `orm` migration: add `embedding` vector column to user models (user responsibility).

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `rag/embedding-cache.test.ts` | Hit/miss, TTL, key collision resistance |
| `rag/str-helper.test.ts` | Str.toEmbeddings with cache arg |
| `rag/files.test.ts` | All CRUD across providers; fake assertions |
| `rag/stores.test.ts` | Create/get/delete; add/remove with metadata; deleteFile arg; Vectorize namespace fallback |
| `rag/reranking.test.ts` | Cohere + Jina; limit; collection macro |
| `rag/similarity-search.test.ts` | `.usingModel()` + custom closure; withDescription |
| `rag/pipeline.test.ts` | Namespace + filter query options (update existing test) |

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/rag.miniflare.test.ts` | Vectorize emulator: insert with namespace + metadata; query with filter; SimilaritySearch tool end-to-end |

**Key scenarios**:
- Ingest 100 docs with namespace 'a', 100 with 'b' → query scoped correctly
- Query with `filter: { author: 'x' }` returns only matching vectors
- Cache hit returns identical vector without provider call
- `Stores.create('kb').add(doc, { metadata: {...} })` → search filter finds via metadata
- SimilaritySearch tool with `.usingModel(Document, 'embedding')` returns results for agent

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Embedding provider rejects batch (rate limit) | Retry with backoff; if all retries fail, partial result + error |
| Files API quota exceeded (provider) | Typed `ProviderQuotaError`; suggest Vectorize fallback |
| Store doesn't exist | `StoreNotFoundError` with provider + ID |
| Metadata schema mismatch | Validate client-side; throw `MetadataValidationError` |
| Reranker returns fewer results than requested | Accept; caller handles len |
| SimilaritySearch against model without vector column | Compile-time type error where possible; runtime `MissingVectorColumnError` |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| EmbeddingCache | Cache stampede | Many concurrent writes of same text | Wasteful provider calls | In-flight dedup via Map<hashKey, Promise<vector>> |
| RAGPipeline | Stale metadata | Vector inserted with old metadata, code updated | Filters miss | Document metadata schema in code; add migration helper |
| Stores (Vectorize fallback) | Namespace collision across apps | Shared Vectorize index | Cross-tenant leak | Default prefix `{appName}:{storeId}`; document isolation |
| Files | Provider file ID mutated | User tracks wrong ID | `FileNotFoundError` | Log adapter + provider on every put() for traceability |
| Reranking | Gateway down | Cohere/Jina Gateway path fails | Reranker unavailable | Failover to secondary reranker (config-driven) |
| SimilaritySearch | Vector column empty | User forgot to embed | Empty results, agent confused | Warn on empty result with non-trivial query |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/rag/
bun test packages/ai/__tests__/integration/rag.miniflare.test.ts
```

## Rollout Considerations

- **Feature flag**: None.
- **Vectorize binding**: Required; AiServiceProvider validates.
- **Rollback**: RAG opt-in; non-RAG agents unaffected.

## Open Items

- [ ] Confirm `@roostjs/orm` has `whereVectorSimilarTo` or plan micro-PR.
- [ ] Decide default similarity threshold — currently 0.5; Laravel uses 0.4 but we use 0.75. Align to 0.5 default.
