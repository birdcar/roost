# Context Map: roost-ai-redesign

**Phase**: 4 (Tools + Attachments + Queueing)
**Scout Confidence**: 74/100
**Verdict**: GO

## Dimensions (Phase 4)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 15/20 | 17 new files + 8 modified enumerated. Spec is concrete on `WebSearch`/`WebFetch`/`FileSearch` builders and `PromptAgentJob`. Two ambiguities remain: (1) Spec's `toRequest(provider)` signature doesn't line up with how `ProviderRequest.tools` is currently typed (`ProviderTool` = `{name,description,parameters}` strict shape); needs a new `ProviderTool` union or parallel field on `ProviderRequest`. (2) Callback-registry KV-vs-in-memory adapter boundary under-specified. |
| Pattern familiarity | 15/20 | `BroadcastStreamJob` at `packages/ai/src/streaming/broadcast-stream-job.ts` is the 1:1 template. `Job<TPayload>` with `this.payload`, `@Queue('...')`, and `Job.dispatch(payload)` all established. `StorableFileLike` shape already stubbed in `types.ts:39-45`. Attachments already wired into `prompt()` + `agent-stream.ts:68`. |
| Dependency awareness | 15/20 | `tool.ts` consumed by `agent.ts:141,227`, `agent-stream.ts:57`, plus exported via `index.ts:71-72`. Providers already accept `attachments?` in `ProviderRequest`. `@roostjs/queue` already a peer+dev dep. `KVStore`/`R2Storage` from `@roostjs/cloudflare` already exported. `Agent.assertQueued/recordQueued` testing hooks already wired (`fakes.ts:53`, `assertions.ts:44`). |
| Edge case coverage | 14/20 | Failure-modes table enumerates callback TTL, large-file memory, agent-rename, empty search, store deletion. Gaps: (a) Agent class serialization — open item in spec; (b) how `QueuedPromptHandle.then()` behaves when consumer completes before handle is returned (race); (c) provider-tool collision with user-defined tool of same name `web_search`; (d) `fromUpload(File)` under Workers runtime (no `fs`); (e) `fromPath` — Workers has no fs — must gate or use Node-only path. |
| Test strategy | 15/20 | Inner-loop `bun test packages/ai/__tests__/tools/` is the idiomatic pattern. `JobFake` / `Agent.fake()` / `AgentFake.recordQueued` infrastructure already exists. `spyOn(globalThis,'fetch')` pattern from `anthropic.test.ts:23` for provider tool markers. Miniflare integration test pattern from `integration/streaming.miniflare.test.ts`. |

## Key Patterns (Phase 4)

- `packages/ai/src/streaming/broadcast-stream-job.ts` (1-24) — canonical template for `PromptAgentJob`: `@Queue('ai-broadcast')` decorator + `extends Job<Payload>` + `handle()` reads `this.payload`. Matches spec's queue-name resolution from class metadata.
- `packages/queue/src/job.ts` (7-30) — `Job<TPayload>` has `constructor(payload, attempt=1)`, `static dispatch(payload)`, `static dispatchAfter(seconds, payload)`. `dispatch` routes through `Dispatcher.get().dispatch(this, payload)` which reads `config.queue` from `getJobConfig`.
- `packages/queue/src/decorators.ts` (4-33) — `@Queue/@MaxRetries/@RetryAfter/@Backoff/@JobTimeout/@Delay` all mutate `target._jobConfig` via `ensureConfig`. Direct re-export from `packages/ai/src/decorators.ts` is the path.
- `packages/ai/src/tool.ts` (1-52) — `Tool` interface has optional `name()` override; `resolveToolName()` already falls back to class name. Spec "add Tool.name() optional override" — **this is already done** (`tool.ts:8-13`). Phase 4 change is kebab-case default (currently returns raw class name at `tool.ts:51`).
- `packages/ai/src/types.ts` (31-45) — `AgentPromptOptions.attachments?: StorableFileLike[]` and `StorableFileLike` interface already exist as stubs. Phase 4 replaces stub with concrete `StorableFile` + `Image`/`Document` classes.
- `packages/ai/src/types.ts` (99-101) — `ProviderRequest.attachments` already declared. All providers already accept this field in `chat()` (agent.ts:154,183 passes it through).
- `packages/ai/src/types.ts` (104-108) — `ProviderTool` is strictly shaped `{name, description, parameters: JsonSchemaOutput}`. Phase 4 must broaden this (discriminated union or companion field) to carry the provider-native tool config. **Spec does not explicitly call this out — a risk.**
- `packages/ai/src/anonymous.ts` (10-19) — `AgentOptions` is the extension point for anonymous-agent queue config (spec's "Anonymous-agent decorator gap"). Add `queue?/maxRetries?/backoff?` fields.
- `packages/ai/src/testing/fakes.ts` (30-54) — `AgentFake.queuedPrompts[]` + `recordQueued(prompt)` already exist. Agent static `assertQueued`/`assertNotQueued`/`assertNeverQueued` wired (`agent.ts:347-366`). Phase 4 queue bridge must invoke `fake.recordQueued(prompt)` when fake is active.
- `packages/cloudflare/src/bindings/r2.ts` (1-27) + `kv.ts` (13-56) — `R2Storage.get/put/delete` and `KVStore.get/put/putJson/delete` + TTL via `KVPutOptions.expirationTtl`. Callback registry uses `putJson` + `expirationTtl: 3600`.
- `packages/ai/src/provider.ts` (30-53) — `AiServiceProvider.register/boot` pattern. Phase 4 adds `callbackRegistry` + `Dispatcher` wiring. `Dispatcher.get()` throws if not initialized — `AiServiceProvider.boot()` should probe like it does for Broadcast.
- `packages/ai/src/providers/anthropic.ts` (49-77) — tools go in top-level `tools` array. Provider tools like `web_search_20250305` need special encoding. Clean insertion point at line 57-65 where user tools are mapped.
- `packages/ai/src/providers/openai.ts` (53-61) — tools wrapped as `{type: 'function', function: {...}}`. Provider tools use `{type: 'web_search'}` (no `function` wrapper) — requires a branch at the mapper.
- `packages/ai/src/providers/gemini.ts` (48-60) — tools wrapped in `{functionDeclarations: [...]}`. `google_search` is a sibling entry, not a function declaration — needs dedicated top-level `tools` union handling.
- `packages/ai/src/providers/workers-ai.ts` (34-41) — no web_search support; spec says "throw helpful error."
- `packages/ai/__tests__/providers/anthropic.test.ts` (21-45) — `spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(...))` + parse `init.body` is the verified pattern for provider-tool request-shape tests.

## Dependencies (Phase 4)

- `packages/ai/src/tool.ts:50-52` (`resolveToolName`) — consumed by `agent.ts:227` (tool dispatch) + `agent.ts:141` + `agent-stream.ts:57` (provider encoding). Kebab-case change is behavior-affecting: verify existing tool-name assertions still match (e.g. `anthropic.test.ts:61` expects `'Calculator'` verbatim — will break unless test tool overrides `name()`).
- `packages/ai/src/agent.ts:95-122` — `prompt()` already accepts `AgentPromptOptions` including `attachments`. Phase 4 adds `.queue(input, options?)` + `.queueAfter(seconds, input, options?)` instance methods on `Agent`. Must check `fakes.get(ctor)` and call `fake.recordQueued(prompt)` (mirroring `recordPrompt` at line 102).
- `packages/ai/src/types.ts:104-108` — `ProviderTool` shape. Recommend: add parallel `providerTools?: ProviderToolConfig[]` field to `ProviderRequest` — zero blast radius on existing provider mappers.
- `packages/ai/src/providers/{anthropic,openai,gemini,workers-ai}.ts` — all four `chat()` entry points need attachment encoding + provider-tool branch. Reference: `attachments?` already read by `agent.ts:154,183` but currently ignored by providers.
- `packages/ai/src/anonymous.ts:10-19` — `AgentOptions` gains `queue?/maxRetries?/backoff?` for anonymous agents bypassing decorator path.
- `packages/ai/src/provider.ts:41-53` — `boot()` wires a `callbackRegistry` singleton + optionally wires `Dispatcher` probe. Mirrors `AiServiceProvider.validateStatefulBindings()` defensive pattern.
- `packages/ai/src/decorators.ts:1-14` — re-exports queue decorators. At dispatch time, `queue-bridge.ts` reads the agent's `_jobConfig` and merges with `PromptAgentJob` defaults.
- `packages/ai/src/index.ts:70-72` — add exports for `Files` namespace, `WebSearch`, `WebFetch`, `FileSearch`, `ProviderToolConfig`.
- `packages/ai/src/index.ts:117-134` — `StorableFileLike` re-export already present; spec adds `Files` namespace with `Image`/`Document` subclasses.
- `packages/queue/src/provider.ts:36-50` — `QueueServiceProvider.boot()` is where `Dispatcher` is set. AI's `callbackRegistry` must register AFTER `QueueServiceProvider` boots.

## Conventions

- **Naming**: Classes `PascalCase`, files `kebab-case.ts`. Tests under `__tests__/{tools,attachments,queueing}/`. `Image`/`Document` exported as `Files.Image` / `Files.Document` — spec says so; translate to `export const Files = { Image, Document }` at `attachments/index.ts`.
- **Imports**: Relative `.js` extension. `import type { X }` for type-only. OK to add `tools/provider-tools/index.ts` and `attachments/index.ts` (precedent already set).
- **Error handling**: Typed errors extending `Error` with `override readonly name = 'XError'`. Phase 4 adds: `AttachmentTooLargeError`, `FileNotFoundError`, `VectorStoreGoneError`, `UnsupportedProviderToolError`.
- **Types**: Prefer discriminated unions. `@roostjs/schema`'s `JsonSchemaOutput` in tool params. Use `satisfies` for provider-body shape narrowing where possible.
- **Testing**: `bun test`; `spyOn(globalThis, 'fetch')` for HTTP. `Job.fake()` + `Job.assertDispatched()` for queue bridge. `Agent.assertQueued()` (existing) for agent-level. Miniflare for `queueing.miniflare.test.ts` integration.
- **Peer+devDep shadow**: `@roostjs/queue` already in both `peerDependencies` (optional) AND `devDependencies` — no change needed (spec assumed it needed adding).

## Risks (Phase 4)

- **`ProviderTool` type is too narrow** (HIGH): Current `ProviderTool = {name, description, parameters}` in `types.ts:104-108` can't carry `{type: 'web_search_20250305', max_uses, allowed_domains, user_location}`. Add sibling `providerTools?: ProviderToolConfig[]` to `ProviderRequest` — keeps user-tool mapping pristine.
- **`resolveToolName` kebab-case is breaking** (HIGH): Flipping `tool.ts:51` default to kebab-case breaks tests that assert verbatim class names (e.g., `providers/anthropic.test.ts:61` expects `'Calculator'`). Update affected tests or keep opt-in.
- **`Files.Image.fromPath` under Workers** (HIGH): No `fs` in Workers runtime. Node-only gate with helpful error.
- **Agent class registration** (HIGH): `PromptAgentJob` needs `agentRegistry` to look up `AgentCtor` from string. Builder must ship `AgentRegistry` class.
- **Queue decorators on agents vs jobs** (HIGH): `@Queue('premium-ai')` on agent mutates `Agent._jobConfig`, but dispatch is through `PromptAgentJob`. `queue-bridge.ts` must read agent's config and pass overrides through `Dispatcher.dispatch()`.
- **`QueuedPromptHandle.then()` race** (MEDIUM): If consumer runs fast, registry must support "fulfill-then-register" (store result; invoke callback when registered).
- **KV TTL misalignment** (MEDIUM): Default 1h; but exponential backoff may span hours. Document prominently.
- **Cross-worker webhook mode** (MEDIUM): Spec mentions `.thenUrl('/webhook')` — defer to later phase, ship KV-backed registry only this phase.
- **Provider tool collision with user tools** (MEDIUM): `class web_search implements Tool` collides with `WebSearch` provider tool. Reject collision at request-build time.
- **`Dispatcher.get()` throws if QueueServiceProvider not booted** (LOW): `AiServiceProvider.boot()` probes + warns rather than throws.
- **Gemini `google_search` vs function-declarations tools array** (LOW): Provider mapper appends both as separate entries in `tools: []` array.

---

## Retained — Phase 3 Sections

### Dimensions (Phase 3)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 13/20 | 21 new files + 8 modified enumerated, but spec's broadcast-bridge API, `AgentChannel` lifecycle hooks, and `StreamEvent` union all mismatch real monorepo types. Builder authors bridging wrappers. |
| Pattern familiarity | 14/20 | In-repo patterns read; `@ai-sdk/react` protocol external knowledge. React-hook test infra absent; Bun + happy-dom chosen. |
| Dependency awareness | 14/20 | `client/` subpath declared P1 but empty. React catalog entry `^19.0.0` exists. Modified files have near-zero current consumers. |
| Edge case coverage | 11/20 | SSE UTF-8 boundaries, sequence numbering for reconnect, SSR hydration shape, Workers AI stream overload — gaps documented in Risks. |
| Test strategy | 10/20 | `bun:test` + `happy-dom` chosen over Vitest. Miniflare 4 already devDep. BroadcastFake exists. |

### Key Patterns (Phase 1)

- `packages/ai/src/providers/interface.ts` (lines 1-7) — minimal `AIProvider` with `name`, `chat`, optional `stream`. Builder extends to `capabilities()`, optional `embed/rerank/image/audio/transcribe`, `files`, `stores`.
- `packages/ai/src/agent.ts` (lines 1-218) — v0.2 Agent. WeakMap fake/provider pattern, tool loop, fake subclass, anonymous `agent()`.
- `packages/queue/src/decorators.ts` (lines 1-37) — canonical decorator pattern: `ensureConfig(target)` mutating `target._jobConfig`.
- `packages/broadcast/src/fake.ts` + `packages/events/src/fake.ts` — thin `recordDispatch(event)` + public array.
- `packages/events/src/event.ts` (lines 1-58) — assertion pattern: static methods on abstract class, WeakMap<Function, EventFake>.
- `packages/events/src/dispatcher.ts` (lines 1-64) — singleton via `EventDispatcher.get/set()`. Peer-dep lazy-load of `@roostjs/queue` + `@roostjs/broadcast`.
- `packages/ai/src/providers/gateway.test.ts` (lines 1-132) — `spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)` pattern.
- `packages/ai/__tests__/agent.test.ts` (lines 1-120) — `MockProvider` + `TestAgent extends Agent` pattern.

### Key Patterns (Phase 2)

- **CF Agents SDK `Agent<Env>`** (`agents` npm pkg): `this.state`, `this.sql`, `this.schedule(when, methodName, payload)`, `onConnect/onMessage/onClose/onError`. `getCurrentAgent()` returns `{agent, connection, request, email}`.
- **CF Sessions API** at `agents/experimental/memory/session`: builder pattern `Session.create(this).withContext(...).onCompaction(fn)...`.
- **`packages/broadcast/src/channel-do.ts` (1-157)** — implements `DurableObject` directly; constructor `(state, env)`; `fetch()` dispatches; hibernation via `state.acceptWebSocket(server, [tags])`, `getWebSockets()`, `getTags(ws)`; lifecycle hooks `webSocketMessage`, `webSocketClose`, `webSocketError`.
- **`packages/broadcast/__tests__/channel-do.test.ts` (1-247)** — `MockDOState` + `MockWebSocket` + `MockWebSocketPair` polyfill pattern for unit testing DOs without miniflare.
- **`packages/cloudflare/src/bindings/durable-objects.ts`** — `DurableObjectClient` wraps namespace with `get(name|id)`.
- **`packages/queue/src/job.ts` (49-82)** — `static fake()/restore()/assertDispatched()` keyed via `WeakMap<Function, JobFake>`.
- **`packages/ai/src/middleware.ts` (13-27, 48-60)** — `addThenHook` via WeakMap side-channel; `runPipeline` composes middleware right-to-left.
- **`packages/ai/src/responses/agent-response.ts:12`** — `conversationId?: string` on `AgentResponse`.

### Key Patterns (Phase 3)

- **`packages/ai/src/agent.ts:272-281`** — `stream()` is a stub that throws. Return type changes from `Promise<ReadableStream<Uint8Array>>` → `StreamableAgentResponse`. Zero live callers, safe breaking change.
- **`packages/ai/src/responses/streamed-response.ts:1-24`** — P1 stub: `StreamedAgentResponse` (collected) + `StreamableAgentResponsePlaceholder` (type-only). P3 replaces placeholder with real class under `src/streaming/streamable-response.ts`.
- **`packages/ai/src/providers/{anthropic,openai,gemini,workers-ai}.ts`** — all four declare `'stream'` in `CAPS.supported`; none implement `stream?()`. P3 fills in.
- **`packages/ai/src/providers/interface.ts:49`** — `stream?(request): AsyncIterable<StreamEvent>` already declared optional. No interface change.
- **`packages/ai/src/stateful/agent.ts:184-191`** — P2 stubs for `onConnect/onMessage` filled in P3.
- **`packages/broadcast/src/manager.ts:52-86`** — `BroadcastManager.broadcast(event: BroadcastableEvent)` takes an event whose `broadcastOn()/broadcastWith()/broadcastAs()` determine channels + payload. Builder must wrap `StreamEvent` in a `StreamEventBroadcast implements BroadcastableEvent`.
- **`packages/broadcast/src/channel-do.ts:96-128`** — hibernation hooks are `webSocketMessage(ws, message)`, `webSocketClose`, `webSocketError` with raw `WebSocket`.
- **`packages/ai/src/middleware.ts:13-27`** — `addThenHook(response, hook)` uses a WeakMap to avoid making `AgentResponse` thenable. `StreamableAgentResponse.then(fn)` in spec is builder-style.
- **`packages/queue/src/dispatcher.ts:10-26`** — `Dispatcher.dispatch(jobClass, payload)` requires a Job class.
- **`packages/ai/__tests__/integration/stateful-agent.miniflare.test.ts`** — template for P3's `streaming.miniflare.test.ts`.
- **Monorepo catalog (`/package.json:10-13`)** — `react: ^19.0.0`, `react-dom: ^19.0.0`, `@types/react: ^19.0.0`. P3 adds via `catalog:` in `peerDependencies`.
- **No Vitest/RTL/jsdom in repo** — P3 uses `bun:test` + `@happy-dom/global-registrator`.

### Dependencies (Phase 3)

- `packages/ai/src/agent.ts:272-281` — `stream()` stub, zero external callers.
- `packages/ai/src/stateful/agent.ts:184-191` — P2 stubs, zero callers.
- `packages/ai/src/providers/workers-ai.ts:29` — `client.run<string>(...)` needs streaming variant.
- `packages/ai/src/providers/{anthropic,openai,gemini}.ts:7` — add `async *stream()` methods.
- `packages/ai/src/events.ts:27-95` — P3 adds `StreamingAgent`, `AgentStreamed`.
- `packages/ai/package.json` — add `react` + `@types/react` to `peerDependencies` (optional via meta).
- `packages/ai/src/index.ts:40-43` — replace `StreamableAgentResponsePlaceholder` re-export with real class.
- `packages/broadcast/src/manager.ts:9` — `BroadcastManager.get()` throws if unregistered.
- `packages/queue/src/dispatcher.ts:99` — `Dispatcher.get()` same pattern.
- `packages/broadcast/src/index.ts:1-8` — exports `ChannelDO`; doesn't export `Connection`/`WSMessage`.

### Conventions (prior)

- **Naming**: Classes `PascalCase`, files `kebab-case.ts`. Tests under `__tests__/{streaming,client,integration}/`.
- **Imports**: Relative `.js` extension. `import type { X }` for type-only.
- **Error handling**: Typed errors extending `Error`; `this.name = 'ClassName'`.
- **Types**: `interface` for shapes, `type` for unions. Prefer `unknown` over `any`.
- **Testing**: `bun:test`; `spyOn(globalThis, 'fetch')` for HTTP. DO unit tests use MockDOState pattern.
- **Subpath React**: React imports confined to `src/client/**/*.tsx`.
- **SSE wire format**: `data: {JSON}\n\n` per W3C EventSource spec.

### Risks (Phase 3)

- **Broadcast bridge API mismatch** (HIGH): Author `StreamEventBroadcast` wrapper + `BroadcastStreamJob` class.
- **`AgentChannel` uses non-existent types** (HIGH): Override real `webSocketMessage(ws, message)`.
- **AgentChannel vs StatefulAgent role split** (HIGH): 1:1 bidirectional vs 1:N broadcast fan-out.
- **StreamEvent shape divergence** (HIGH): Migrate P1 flat shape to discriminated union.
- **`.then()` thenable trap** (MEDIUM): Builder-style method returns `this`, not Promise.
- **Workers AI streaming path** (MEDIUM): Separate code path with `{stream: true}` + SSE parsing.
- **Anthropic SSE translation** (MEDIUM): Handle all delta types; tool-call args accumulate.
- **React testing infra missing** (MEDIUM): `bun:test` + `@happy-dom/global-registrator`.
- **SSR snapshot shape** (MEDIUM): `useSyncExternalStore.getServerSnapshot` default `{status: 'idle'}`.
- **No resume-from-seq** (MEDIUM): Defer replay-after-reconnect.
- **BroadcastManager not registered** (MEDIUM): Probe + warn, don't throw.
- **Bundle-size boundary enforcement** (LOW): CI scan for `from 'react'` outside `src/client/`.
- **FailoverProvider doesn't handle stream** (LOW): Follow-up.
- **`types.ts` + `index.ts` effectively Modified** — spec table omitted but must be updated.
