# Context Map: roost-ai-redesign

**Phase**: 3 (Streaming + Realtime + React Client)
**Scout Confidence**: 62/100
**Verdict**: HOLD → user opted to proceed with documented deviations

## Dimensions (Phase 3)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 13/20 | 21 new files + 8 modified enumerated, but spec's broadcast-bridge API, `AgentChannel` lifecycle hooks, and `StreamEvent` union all mismatch real monorepo types. Builder authors bridging wrappers. |
| Pattern familiarity | 14/20 | In-repo patterns read; `@ai-sdk/react` protocol external knowledge. React-hook test infra absent; Bun + happy-dom chosen. |
| Dependency awareness | 14/20 | `client/` subpath declared P1 but empty. React catalog entry `^19.0.0` exists. Modified files have near-zero current consumers. |
| Edge case coverage | 11/20 | SSE UTF-8 boundaries, sequence numbering for reconnect, SSR hydration shape, Workers AI stream overload — gaps documented in Risks. |
| Test strategy | 10/20 | `bun:test` + `happy-dom` chosen over Vitest. Miniflare 4 already devDep. BroadcastFake exists. |

## Key Patterns (Phase 1)

- `packages/ai/src/providers/interface.ts` (lines 1-7) — minimal `AIProvider` with `name`, `chat`, optional `stream`. Builder extends to `capabilities()`, optional `embed/rerank/image/audio/transcribe`, `files`, `stores`.
- `packages/ai/src/agent.ts` (lines 1-218) — v0.2 Agent. WeakMap fake/provider pattern, tool loop, fake subclass, anonymous `agent()`.
- `packages/queue/src/decorators.ts` (lines 1-37) — canonical decorator pattern: `ensureConfig(target)` mutating `target._jobConfig`.
- `packages/broadcast/src/fake.ts` + `packages/events/src/fake.ts` — thin `recordDispatch(event)` + public array.
- `packages/events/src/event.ts` (lines 1-58) — assertion pattern: static methods on abstract class, WeakMap<Function, EventFake>.
- `packages/events/src/dispatcher.ts` (lines 1-64) — singleton via `EventDispatcher.get/set()`. Peer-dep lazy-load of `@roostjs/queue` + `@roostjs/broadcast`.
- `packages/ai/src/providers/gateway.test.ts` (lines 1-132) — `spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)` pattern.
- `packages/ai/__tests__/agent.test.ts` (lines 1-120) — `MockProvider` + `TestAgent extends Agent` pattern.

## Key Patterns (Phase 2)

- **CF Agents SDK `Agent<Env>`** (`agents` npm pkg): `this.state`, `this.sql`, `this.schedule(when, methodName, payload)`, `onConnect/onMessage/onClose/onError`. `getCurrentAgent()` returns `{agent, connection, request, email}`.
- **CF Sessions API** at `agents/experimental/memory/session`: builder pattern `Session.create(this).withContext(...).onCompaction(fn)...`.
- **`packages/broadcast/src/channel-do.ts` (1-157)** — implements `DurableObject` directly; constructor `(state, env)`; `fetch()` dispatches; hibernation via `state.acceptWebSocket(server, [tags])`, `getWebSockets()`, `getTags(ws)`; lifecycle hooks `webSocketMessage`, `webSocketClose`, `webSocketError`.
- **`packages/broadcast/__tests__/channel-do.test.ts` (1-247)** — `MockDOState` + `MockWebSocket` + `MockWebSocketPair` polyfill pattern for unit testing DOs without miniflare.
- **`packages/cloudflare/src/bindings/durable-objects.ts`** — `DurableObjectClient` wraps namespace with `get(name|id)`.
- **`packages/queue/src/job.ts` (49-82)** — `static fake()/restore()/assertDispatched()` keyed via `WeakMap<Function, JobFake>`.
- **`packages/ai/src/middleware.ts` (13-27, 48-60)** — `addThenHook` via WeakMap side-channel; `runPipeline` composes middleware right-to-left.
- **`packages/ai/src/responses/agent-response.ts:12`** — `conversationId?: string` on `AgentResponse`.

## Key Patterns (Phase 3)

- **`packages/ai/src/agent.ts:272-281`** — `stream()` is a stub that throws. Return type changes from `Promise<ReadableStream<Uint8Array>>` → `StreamableAgentResponse`. Zero live callers, safe breaking change.
- **`packages/ai/src/responses/streamed-response.ts:1-24`** — P1 stub: `StreamedAgentResponse` (collected) + `StreamableAgentResponsePlaceholder` (type-only). P3 replaces placeholder with real class under `src/streaming/streamable-response.ts`.
- **`packages/ai/src/providers/{anthropic,openai,gemini,workers-ai}.ts`** — all four declare `'stream'` in `CAPS.supported`; none implement `stream?()`. P3 fills in.
- **`packages/ai/src/providers/interface.ts:49`** — `stream?(request): AsyncIterable<StreamEvent>` already declared optional. No interface change.
- **`packages/ai/src/stateful/agent.ts:184-191`** — P2 stubs for `onConnect/onMessage` filled in P3.
- **`packages/broadcast/src/manager.ts:52-86`** — `BroadcastManager.broadcast(event: BroadcastableEvent)` takes an event whose `broadcastOn()/broadcastWith()/broadcastAs()` determine channels + payload. Builder must wrap `StreamEvent` in a `StreamEventBroadcast implements BroadcastableEvent`.
- **`packages/broadcast/src/channel-do.ts:96-128`** — hibernation hooks are `webSocketMessage(ws, message)`, `webSocketClose`, `webSocketError` with raw `WebSocket`. Spec's `onMessage(connection, message)` names don't match — use the real hooks.
- **`packages/ai/src/middleware.ts:13-27`** — `addThenHook(response, hook)` uses a WeakMap to avoid making `AgentResponse` thenable. `StreamableAgentResponse.then(fn)` in spec is builder-style — acceptable because it returns `this`, not a `Promise`.
- **`packages/queue/src/dispatcher.ts:10-26`** — `Dispatcher.dispatch(jobClass, payload)` requires a Job class. Spec's `broadcastOnQueue(q, c)` requires a Job subclass (`BroadcastStreamJob`) to be authored.
- **`packages/ai/__tests__/integration/stateful-agent.miniflare.test.ts`** — template for P3's `streaming.miniflare.test.ts`.
- **Monorepo catalog (`/package.json:10-13`)** — `react: ^19.0.0`, `react-dom: ^19.0.0`, `@types/react: ^19.0.0`. P3 adds via `catalog:` in `peerDependencies`.
- **No Vitest/RTL/jsdom in repo** — P3 uses `bun:test` + `@happy-dom/global-registrator`.

## Dependencies (Phase 3)

- `packages/ai/src/agent.ts:272-281` — `stream()` stub, zero external callers. Safe signature change.
- `packages/ai/src/stateful/agent.ts:184-191` — P2 stubs, zero callers. P3 fills.
- `packages/ai/src/providers/workers-ai.ts:29` — `client.run<string>(...)` needs streaming variant.
- `packages/ai/src/providers/{anthropic,openai,gemini}.ts:7` — add `async *stream()` methods.
- `packages/ai/src/events.ts:27-95` — P3 adds `StreamingAgent`, `AgentStreamed` mirroring `PromptingAgent`/`AgentPrompted`.
- `packages/ai/package.json` — add `react` + `@types/react` to `peerDependencies` (optional via meta). Pattern: `packages/auth/package.json:21-24`.
- `packages/ai/src/index.ts:40-43` — replace `StreamableAgentResponsePlaceholder` re-export with real class.
- `packages/broadcast/src/manager.ts:9` — `BroadcastManager.get()` throws if unregistered. Probe in `AiServiceProvider.boot()`.
- `packages/queue/src/dispatcher.ts:99` — `Dispatcher.get()` same pattern.
- `packages/broadcast/src/index.ts:1-8` — exports `ChannelDO`; doesn't export `Connection`/`WSMessage` (don't exist).

## Conventions

- **Naming**: Classes `PascalCase`, files `kebab-case.ts`. Tests under `__tests__/{streaming,client,integration}/`.
- **Imports**: Relative `.js` extension. `import type { X }` for type-only. Barrels OK.
- **Error handling**: Typed errors extending `Error`; `this.name = 'ClassName'`. P3 adds: `OriginNotAllowedError`, `StreamingUnsupportedError`.
- **Types**: `interface` for shapes, `type` for unions. Prefer `unknown` over `any`. **Migrate `StreamEvent` to true discriminated union in P3.**
- **Testing**: `bun:test`; `spyOn(globalThis, 'fetch')` for HTTP. DO unit tests use MockDOState pattern. React hook tests use `@happy-dom/global-registrator` + `@testing-library/react`.
- **Subpath React**: React imports confined to `src/client/**/*.tsx`. Server code never imports from `/client`.
- **SSE wire format**: `data: {JSON}\n\n` per W3C EventSource spec.

## Risks (Phase 3)

- **Broadcast bridge API mismatch** (HIGH): Spec pseudocode `BroadcastManager.get().broadcast(c, 'ai.stream', event)` doesn't match real signature. Author `StreamEventBroadcast` wrapper + `BroadcastStreamJob` class.
- **`AgentChannel` uses non-existent types** (HIGH): Override real `webSocketMessage(ws, message)`, not spec's `onMessage(connection, message)`.
- **AgentChannel vs StatefulAgent.onConnect role split** (HIGH): StatefulAgent's `onConnect/onMessage` handle 1:1 bidirectional prompting; AgentChannel is for 1:N broadcast fan-out. Do not conflate.
- **StreamEvent shape divergence** (HIGH): Migrate P1 flat shape to discriminated union now (zero consumers).
- **`.then()` thenable trap** (MEDIUM): Spec uses `.then(fn)` on StreamableAgentResponse — a builder-style method returning `this`. Consumers must NOT `await` the stream object (must `.toResponse()` or iterate). Document loudly.
- **Workers AI streaming path** (MEDIUM): Separate code path in `workers-ai.ts` with `{stream: true}` + SSE parsing of `text/event-stream` frames.
- **Anthropic SSE translation** (MEDIUM): Handle `message_start`, `content_block_start`, `content_block_delta` (text + input_json), `content_block_stop`, `message_delta`, `message_stop`. Tool-call args accumulate across deltas.
- **React testing infra missing** (MEDIUM): Use `bun:test` + `@happy-dom/global-registrator` + `@testing-library/react`. Single runner.
- **SSR snapshot shape** (MEDIUM): `useSyncExternalStore.getServerSnapshot` default `{status: 'idle'}`. Document TanStack Start loader-data flow as follow-up.
- **No resume-from-seq** (MEDIUM): Defer replay-after-reconnect to P3.1; ship simple restart-stream policy.
- **BroadcastManager not registered** (MEDIUM): `AiServiceProvider.boot()` probes + warns, doesn't throw.
- **Bundle-size boundary enforcement** (LOW): Add a CI scan for `from 'react'` imports outside `src/client/`.
- **FailoverProvider doesn't handle stream** (LOW): Follow-up.
- **`types.ts` + `index.ts` are effectively Modified** — spec table omits them but they must be updated.
