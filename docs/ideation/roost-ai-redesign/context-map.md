# Context Map: roost-ai-redesign

**Phase**: 6 (Media: Image + Audio + Transcription)
**Scout Confidence**: 74/100
**Verdict**: GO

## Dimensions (Phase 6)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 15/20 | Spec-template-media.md gives a clean 5-part shape instantiated 3 times. Ambiguities: (1) `CapabilityNotSupportedError` is not defined anywhere — must be added. (2) `Stringable` from Audio input is undefined in repo — spec likely means `string \| { toString(): string }`. (3) Transcription `Segment` / `DiarizedSegment` types are new. |
| Pattern familiarity | 16/20 | `RerankingBuilder` (rag/reranking/reranking.ts:51-91) is closest shape match. `BroadcastStreamJob` (streaming/broadcast-stream-job.ts:17-24) is 1:1 template for media jobs. |
| Dependency awareness | 14/20 | `AIProvider` interface extension has 6 implementors. `ProviderCapability` already includes `'image'`, `'audio'`, `'transcribe'`. |
| Edge case coverage | 14/20 | Gaps: R2 bucket binding validation, `UnsupportedOptionDropped` event missing, `.queue().then()` callback TTL in-memory only. |
| Test strategy | 15/20 | `packages/ai/__tests__/media/` doesn't exist yet. Fixtures needed. Miniflare patterns established. |

## Key Patterns (Phase 6)

- `packages/ai/src/rag/reranking/reranking.ts:51-119` — `RerankingBuilder` + static `Reranking.of/.fake/.restore/.assertReranked` namespace.
- `packages/ai/src/rag/files/files.ts:16-46` — `FilesFake` counter + `stored[]` + `deleted[]` + `records` Map pattern.
- `packages/ai/src/streaming/broadcast-stream-job.ts:17-24` — `@Queue('name') class XJob extends Job<Payload>` template.
- `packages/ai/src/queueing/callback-registry.ts:14-92` — `InMemoryCallbackRegistry` with `fulfill/reject/onFulfilled/onRejected`.
- `packages/ai/src/queueing/queue-bridge.ts:10-22` — `QueuedPromptHandle.then(cb).catch(cb)` thenable pattern.
- `packages/ai/src/agent.ts:407-448` — `dispatchQueuedPrompt` fake-shortcut + job dispatch pattern.
- `packages/ai/src/providers/openai.ts:154-170` — `async embed(req): Promise<EmbedResponse>` HTTP template.
- `packages/ai/src/events.ts:27-45, 69-77, 99-117` — Event class pattern.
- `packages/ai/src/providers/attachment-encoding.ts:25-46` — `encodeAttachment` + `encodeAll` reusable for Image.
- `packages/ai/src/testing/fakes.ts:29-92` — `AgentFake` template.
- `packages/ai/src/testing/assertions.ts:11-77` — assertion helpers.
- `packages/ai/src/prompt.ts:11-35` — `AgentPrompt` value object.
- `packages/cloudflare/src/bindings/r2.ts:1-27` — `R2Storage.put/get/delete/list/head`.

## Dependencies (Phase 6)

- `packages/ai/src/providers/interface.ts:45-52` — extend `AIProvider` with optional `image?`, `audio?`, `transcribe?`.
- `packages/ai/src/providers/workers-ai.ts:8-14` (CAPS), `:25-99` — add `image()` (flux), `audio()` (melotts), `transcribe()` (whisper).
- `packages/ai/src/providers/openai.ts:7-13` (CAPS) — add `image()`, `audio()`, `transcribe()`.
- `packages/ai/src/providers/gemini.ts` — add `image()` (Imagen).
- `packages/ai/src/providers/anthropic.ts` — no native media; skip.
- `packages/ai/src/providers/failover.ts:18-62` — extend with `image?/audio?/transcribe?` methods.
- `packages/ai/src/media/index.ts` — replace stub with re-exports.
- `packages/ai/src/events.ts` — add 6 media event re-exports.
- `packages/ai/src/testing/index.ts` — re-export media fakes/assertions.
- `packages/ai/package.json` — add `./media/image`, `./media/audio`, `./media/transcription` subpaths.

## Conventions (Phase 6)

- **Naming**: Classes `PascalCase`; files `kebab-case.ts`; tests `{feature}.test.ts` under `__tests__/media/{mediaName}/`.
- **Imports**: Relative + `.js` extension (NodeNext). `import type { X }` for type-only. Dynamic imports for optional deps.
- **Barrel files**: Project uses them — `media/index.ts` and sub-barrels OK.
- **Error handling**: Typed errors extending `Error` with `override readonly name = 'X'`.
- **Types**: Discriminated unions for source tracking.
- **Testing**: `bun:test` with `describe/it/expect/beforeEach/afterEach/spyOn`.
- **Events**: `extends Event` from `@roostjs/events`. `dispatchEvent(EventCtor, new EventCtor(...))`.
- **Builder fluency**: Every fluent method returns `this`. Terminals `generate()` + `queue()`. `timeout(seconds)` on every builder.

## Risks (Phase 6)

- **`CapabilityNotSupportedError` undefined** (HIGH): Add to `packages/ai/src/providers/interface.ts`.
- **`FailoverProvider` media support** (HIGH): Only forwards `chat()` — needs `image()/audio()/transcribe()` methods.
- **R2 public URL wiring** (HIGH): No precedent — add config key `ai.r2.publicUrl`.
- **`handleId` vs `promptId`** (MEDIUM): Callback registry typed to `AgentResponse` — generalize with generic or coerce.
- **Transcription no `.store()` helpers** (MEDIUM): Document subclass divergence.
- **Workers AI TTS model churn** (MEDIUM): Lock ID behind capability check.
- **`UnsupportedOptionDropped` event** (LOW): Add to media events.
- **Callback registry in-memory only** (LOW): Document; KV-backed registry future work.

---

## Retained — Phase 5 Sections

### Dimensions (Phase 5)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 14/20 | 17 new files + 7 modified. |
| Pattern familiarity | 15/20 | `RAGPipeline.fake()/restore()/assertIngested()/assertQueried()` at `pipeline.ts:93-132`. |
| Dependency awareness | 13/20 | `@roostjs/orm` lacks `whereVectorSimilarTo` — inlined. |
| Edge case coverage | 14/20 | Gaps: empty docs array in Reranking; concurrent `Stores.create` idempotency. |
| Test strategy | 14/20 | `__tests__/rag/` + Miniflare 4 integration. |

### Key Patterns (Phase 5)

- `packages/ai/src/rag/pipeline.ts:8-14, 93-132` — canonical `RAGPipeline.fake()/restore()/assertIngested()/assertQueried()`.
- `packages/cloudflare/src/bindings/kv.ts:41-47` — `put(key, value, {expirationTtl})` with 30-day default.
- `packages/ai/src/providers/openai.ts:154-170` — `embed(EmbedRequest): EmbedResponse` fetch pattern.
- `packages/ai/src/providers/interface.ts:4-16` — `ProviderCapability` union.
- `packages/ai/src/providers/gateway.ts:55-97` — Gateway routing pattern.

## Retained — Phase 4 Sections

### Key Patterns (Phase 4)

- `packages/ai/src/streaming/broadcast-stream-job.ts` — PromptAgentJob template.
- `packages/queue/src/job.ts` (7-30) — Job<TPayload> dispatch API.
- `packages/queue/src/decorators.ts` (4-33) — canonical @Queue/@MaxRetries decorator pattern.
- `packages/ai/src/tool.ts` — Tool.name() kebab-case default.
- `packages/ai/src/testing/fakes.ts` — AgentFake.recordQueued pattern.

## Retained — Phase 3, 2, 1 Sections

Phase 3 — Streaming + realtime + React client.
Phase 2 — Stateful agents on DOs.
Phase 1 — Foundation rewrite.
