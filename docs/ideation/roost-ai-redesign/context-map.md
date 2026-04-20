# Context Map: roost-ai-redesign

**Phase**: 5 (RAG + Files + Vector Stores + Reranking)
**Scout Confidence**: 70/100
**Verdict**: GO

## Dimensions (Phase 5)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 14/20 | 17 new files + 7 modified. Two ambiguities: (1) `EmbeddingPipeline` takes `AIClient` (WorkersAI binding), not `AIProvider`; `Str.toEmbeddings({provider})` path needs rewire. (2) `Files` in P4 is `{Image, Document} as const` frozen — P5 adds `.store/.get/.delete/.fake`; requires refactor. |
| Pattern familiarity | 15/20 | `RAGPipeline.fake()/restore()/assertIngested()/assertQueried()` at `pipeline.ts:93-132` is 1:1 template for `Files.fake/Stores.fake/Reranking.fake`. `KVStore.put(key, value, {expirationTtl})` confirmed at `bindings/kv.ts:41-47`. `VectorStore.query(vec, {namespace, filter, returnMetadata})` pass-through at `bindings/vectorize.ts:8-13`. |
| Dependency awareness | 13/20 | `EmbeddingPipeline` hard-wired to `AIClient`. `OpenAIProvider.embed` + `WorkersAIProvider.embed` exist. Anthropic + Gemini do NOT implement `embed?()`. `@roostjs/orm` `QueryBuilder` does NOT have `whereVectorSimilarTo` — spec Open Item; must inline or ship micro-PR. Cohere/Jina not in `Lab` enum. |
| Edge case coverage | 14/20 | Failure-modes table enumerates cache stampede, stale metadata, namespace collision, gateway down, empty vector column. Gaps: (a) empty docs array in Reranking; (b) concurrent `Stores.create('kb')` idempotency; (c) `Files.store(file)` capability fallback logic. |
| Test strategy | 14/20 | `packages/ai/__tests__/rag/` doesn't exist yet — must be created. Existing RAG tests at `packages/ai/src/rag/__tests__/` stay; new tests at `__tests__/rag/`. Miniflare 4 already devDep. First Vectorize emulator integration test. |

## Key Patterns (Phase 5)

- `packages/ai/src/rag/pipeline.ts:8-14, 93-132` — canonical `RAGPipeline.fake()/restore()/assertIngested()/assertQueried()` — WeakMap + recordXXX + assertYYY. 1:1 template for `Files.fake/Stores.fake/Reranking.fake`.
- `packages/ai/src/rag/pipeline.ts:56-62` — `VectorStore.query(queryVector, options)` forwards `namespace` + `returnMetadata`. P5 adds `filter` — `VectorizeQueryOptions.filter` is pass-through.
- `packages/cloudflare/src/bindings/kv.ts:41-47` — `put(key, value, {expirationTtl})` with 30-day default. `get(key, 'text')` returns string-or-null.
- `packages/ai/src/providers/openai.ts:154-170` — `embed(EmbedRequest): EmbedResponse` fetch `/v1/embeddings`, map `data[].embedding`. Reference for Cohere/Jina rerank HTTP shapes.
- `packages/ai/src/providers/workers-ai.ts:92-99` — `embed()` via `client.run<{data:number[][]}>`. The hard-wired path to re-route through `AIProvider.embed()`.
- `packages/ai/src/providers/interface.ts:26-36` — `EmbedRequest/EmbedResponse` already defined.
- `packages/ai/src/providers/interface.ts:4-16` — `ProviderCapability` union already includes `'files'`, `'stores'`, `'rerank'`, `'embed'`. No union change — providers declare support.
- `packages/ai/src/providers/gateway.ts:55-97` — routing pattern. Reranking via Gateway: POST `https://gateway.ai.cloudflare.com/v1/{acctId}/{gatewayId}/{cohere|jina}/v1/rerank`.
- `packages/ai/src/attachments/storable-file.ts:148-161` — `put/get/delete` currently throw "Phase 5" stubs. P5 replaces with adapter routing.
- `packages/ai/src/attachments/index.ts:17` — `export const Files = {Image, Document} as const`. **P5 refactors**: lift `Files` construction to `rag/files/files.ts`, re-export `Image/Document` from attachments.
- `packages/ai/src/testing/fakes.ts:29-55` — `AgentFake.queuedPrompts` + `recordQueued` pattern. `FilesFake/StoresFake/RerankingFake` follow identically.
- `packages/ai/src/events.ts:27-45` — event-class pattern: `extends Event` with `constructor(public readonly X, ...)` + `super()`. 12 new events follow.

## Dependencies (Phase 5)

- `packages/ai/src/rag/embedding-pipeline.ts:5-8` — constructor takes `AIClient`. P5 adds optional `cache?: EmbeddingCache` arg; provider-agnostic `Str` resolves pipeline at call time.
- `packages/ai/src/rag/pipeline.ts:49-91` — `query(text)` signature widens to `query(text, opts?: {namespace, filter, topK, minSimilarity})`. Zero external callers; safe.
- `packages/ai/src/rag/types.ts` — add `FileRecord`, `StoreRecord`, `StorableFileMetadata`, `RerankResult` + error types.
- `packages/ai/src/rag/index.ts` — add ~15 re-exports.
- `packages/ai/src/providers/interface.ts:45-52` — add `files?`, `stores?`, `rerank?` optional methods. Zero breakage; all optional.
- `packages/ai/src/attachments/index.ts:17` — `Files` namespace widening.
- `packages/ai/src/attachments/storable-file.ts:148-161` — `put()/get()/delete()` stubs replaced with adapter routing.
- `packages/ai/src/index.ts:98-109` — existing `Files/Image/Document` exports. Keep; extend `Files` via merged re-export from `rag/files/files.ts`.
- `packages/ai/src/events.ts` — add 12 new RAG events + re-export from root.
- `packages/ai/__tests__/rag/` — directory doesn't exist; create.

## Conventions

- **Naming**: Classes `PascalCase`, files `kebab-case.ts`. Tests under `__tests__/rag/{...}.test.ts`.
- **Imports**: Relative `.js` extension. `import type { X }` for type-only. OK to add `rag/{files,stores,reranking,testing}/index.ts` internal barrels.
- **Error handling**: Typed errors extending `Error` with `override readonly name`. P5 adds: `ProviderQuotaError`, `StoreNotFoundError`, `MetadataValidationError`, `MissingVectorColumnError`, `RerankerUnavailableError`.
- **Types**: Discriminated unions. `RerankResult = {index, document, score}` strict interface.
- **Testing**: `bun test`; `spyOn(globalThis, 'fetch')` for HTTP; `mock()` for VectorStore/KV. Miniflare for Vectorize integration.
- **Events**: `extends Event` from `@roostjs/events`. `dispatchEvent(EventCtor, new EventCtor(...))`.

## Risks (Phase 5)

- **`Files` identifier collision** (HIGH): P4 `Files = {Image, Document} as const`. P5 adds `.store/.get/.delete/.fake`. Refactor: move `Files` to `rag/files/files.ts`, keep `Image/Document` exports in `attachments/`. Root `index.ts` re-exports merged `Files`.
- **`EmbeddingPipeline` is Workers-AI-only** (HIGH): constructor takes `AIClient`. `Str.toEmbeddings({provider: Lab.OpenAI})` needs rewire. Solution: keep existing constructor, add optional `cache` injection, and support a new `AIProvider`-backed pipeline adjacent if needed.
- **`@roostjs/orm` lacks `whereVectorSimilarTo`** (HIGH): Must ship micro-PR OR inline Vectorize lookup in `SimilaritySearch.usingModel`. Latter avoids cross-package coupling.
- **Cohere/Jina not in `Lab` enum** (HIGH): Extend `Lab` with `Cohere: 'cohere'`, `Jina: 'jina'`. Additive change.
- **`Stores.fake()` per-handle assertions** (MEDIUM): Fake returns a `VectorStoreHandle` that records into shared `StoresFake` registry.
- **Vectorize namespace cross-tenant leak** (MEDIUM): Auto-apply `{appName}:{storeId}` prefix in all adapter operations.
- **Metadata validation schema** (MEDIUM): Strict via `@roostjs/schema` or schemaless? Default schemaless; opt-in validation.
- **Root `Files` re-export** (MEDIUM): After refactor, `import { Files } from '@roostjs/ai'` must still work with merged namespace (`.store/.get/.delete` + `.Image/.Document`).
- **Reranking collection macro polluting `Array.prototype`** (MEDIUM): Opt-in via `import '@roostjs/ai/rag/reranking/collection-macro'`. Side-effect file with `declare global { interface Array<T> {...}}`.
- **`RAGPipeline.fake()` vs new fakes** (LOW): Separate namespaces; no collision.
- **First Vectorize integration test** (LOW): Miniflare's Vectorize emulator less battle-tested than KV/DO/Queue.
- **Default similarity threshold drift** (LOW): Current `pipeline.ts:63` uses 0.75; spec proposes 0.5. Align to 0.5.

---

## Retained — Phase 4 Sections

### Dimensions (Phase 4)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 15/20 | 17 new files + 8 modified enumerated. Spec concrete on WebSearch/WebFetch/FileSearch + PromptAgentJob. |
| Pattern familiarity | 15/20 | BroadcastStreamJob 1:1 template. Job<TPayload>+@Queue established. |
| Dependency awareness | 15/20 | tool.ts consumers mapped. @roostjs/queue dep confirmed. |
| Edge case coverage | 14/20 | Failure modes enumerated. |
| Test strategy | 15/20 | Bun + spyOn + JobFake + AgentFake infra exists. |

### Key Patterns (Phase 4)

- `packages/ai/src/streaming/broadcast-stream-job.ts` (1-24) — PromptAgentJob template.
- `packages/queue/src/job.ts` (7-30) — Job<TPayload> dispatch API.
- `packages/queue/src/decorators.ts` (4-33) — canonical @Queue/@MaxRetries decorator pattern.
- `packages/ai/src/tool.ts` — Tool.name() kebab-case default + ProviderTool/partitionTools.
- `packages/ai/src/types.ts` — `providerTools?: ProviderToolConfig[]` sibling field pattern.
- `packages/ai/src/testing/fakes.ts` — AgentFake.recordQueued pattern.
- `packages/cloudflare/src/bindings/{r2,kv}.ts` — CF storage primitives.
- `packages/ai/src/provider.ts` — AiServiceProvider boot/probe pattern.
- `packages/ai/src/providers/*.ts` — attachment encoding + provider-tool branch per provider.
- `packages/ai/__tests__/providers/anthropic.test.ts:21-45` — spyOn(fetch) + parse init.body pattern for request-shape tests.

### Risks (Phase 4)

- ProviderTool type too narrow (HIGH — resolved via providerTools? sibling field)
- resolveToolName kebab-case breaking (HIGH — resolved, tests updated)
- Files.Image.fromPath under Workers (HIGH — resolved, Node-only gate)
- Agent class registration (HIGH — resolved via AgentRegistry)
- Queue decorators on agents (HIGH — resolved in queue-bridge)
- QueuedPromptHandle.then() race (MEDIUM — resolved, fulfill-then-register supported)
- QueuedPromptHandle thenable trap (resolved: queue() returns synchronously)

---

## Retained — Phase 3 Sections

Streaming + realtime + React client. Key patterns: `broadcast-stream-job.ts`, `streamable-response.ts`, SSE parsing, React hooks via `useSyncExternalStore`. All shipped.

## Retained — Phase 2 Sections

Stateful agents on DOs. Key patterns: CF Agents SDK, Sessions API, MockDOState test pattern, ChannelDO hibernation hooks.

## Retained — Phase 1 Sections

Foundation rewrite. Key patterns: AIProvider interface, Agent base class, middleware pipeline, capability table.
