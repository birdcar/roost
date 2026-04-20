# Context Map: roost-ai-redesign

**Phase**: 7 (Workflows + Sub-agents + MCP)
**Scout Confidence**: 82/100
**Verdict**: GO (inline exploration — scout subagent rejected)

## Dimensions (Phase 7)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 17/20 | Spec is explicit: Workflows via `@roostjs/workflow` Workflow base (not raw CF `WorkflowEntrypoint`), sub-agents via Roost-native `DurableObjectClient` RPC, MCP via `@modelcontextprotocol/sdk` TypeScript client. `@modelcontextprotocol/sdk` is NOT yet installed — must be added. |
| Pattern familiarity | 16/20 | `WorkflowClient` at `packages/workflow/src/client.ts`, `Workflow` abstract at `packages/workflow/src/workflow.ts:7-34`, `DurableObjectClient` at `packages/cloudflare/src/bindings/durable-objects.ts:1-25`. Existing `packages/mcp/` is a standalone server package (NOT consumed by @roostjs/ai) — our `/mcp` subpath is separate. |
| Dependency awareness | 16/20 | `StatefulAgent` consumed by `packages/ai/__tests__/stateful/*.test.ts`. `decorators.ts` consumed broadly. `provider.ts` has its own validation logic — must not break stateful validation. |
| Edge case coverage | 15/20 | Gaps: (1) `run()` wrapper for workflow method must allow `step` injection via symbol-keyed first arg — CF runtime calls `run(event, step)`. (2) Sub-agent RPC must reject non-public methods. (3) MCP tool adapter — JSON Schema subset is `type/properties/required` — SchemaBuilder exposes `object/string/number/array`. |
| Test strategy | 18/20 | `TestStatefulAgentHarness` + `MockDurableObjectState` allow full unit tests without miniflare. `bun:test` with `describe/it/expect`. Miniflare integration exists but deferred in P7 per scope. |

## Key Patterns (Phase 7)

- `packages/workflow/src/workflow.ts:7-34` — `Workflow<Env, TParams> extends WorkflowEntrypoint` abstract with `run(event, step)`; static `fake/restore/assertCreated` keyed by WeakMap. Used as base for `AgentMethodWorkflow`.
- `packages/workflow/src/client.ts:4-37` — `WorkflowClient<TParams>` wraps CF `Workflow<TParams>` binding, exposes `create/get/terminate` returning `WorkflowInstanceHandle`.
- `packages/workflow/src/testing.ts:1-37` — `WorkflowFake` with `assertCreated/assertNotCreated`.
- `packages/workflow/src/compensable.ts:1-22` — LIFO compensation registry for workflow steps.
- `packages/cloudflare/src/bindings/durable-objects.ts:1-25` — `DurableObjectClient.get(string | id)` returns stub. Used for sub-agent RPC.
- `packages/ai/src/stateful/agent.ts:198-210` — `fetch()` / `onRequest()` pattern. Extend `onRequest()` to recognize `/_/rpc`, `/_/abort`, `/_/delete` BEFORE user dispatch.
- `packages/ai/src/decorators.ts:1-162` — WeakMap-keyed decorator registries (configMap, statefulMap, statefulClasses). Add @Workflow/@WorkflowStep/@SubAgentCapable following same pattern.
- `packages/ai/src/tool.ts:9-18` — `Tool` interface: `name?/description/schema/handle`. Tool factory `toolFromMcp` must return object satisfying this shape.
- `packages/ai/src/testing/stateful-harness.ts:28-130` — `TestStatefulAgentHarness.for(Agent).build()` pattern; returns `{agent, cleanup, advance, setNow, state}`.
- `packages/ai/src/testing/mock-do-state.ts:90-144` — `MockDurableObjectState` implements `StatefulAgentCtx` minus the socket/alarm features not needed for P7 tests.
- `packages/ai/src/tools/provider-tools/` — sibling tools dir for Tool shape references.

## Dependencies (Phase 7)

- `packages/ai/src/stateful/agent.ts` — modify `onRequest()` to add control-plane routes; add `subAgent()` helper method, `workflows` accessor (Map of binding name → WorkflowClient), `abort` hook to `AbortController`. Consumers: `packages/ai/__tests__/stateful/agent.test.ts`, `packages/ai/__tests__/streaming/`, `packages/ai/__tests__/integration/stateful-agent.miniflare.test.ts`.
- `packages/ai/src/decorators.ts` — add `@Workflow`, `@WorkflowStep`, `@SubAgentCapable`. Consumers: user agent classes; test files in `__tests__/decorators.test.ts`.
- `packages/ai/src/provider.ts` — extend `AiServiceProvider` to register WorkflowClient factories per `@Workflow` binding and MCP portals config. Consumer: integration flow.
- `packages/ai/src/stateful/context.ts` — `getCurrentAgent()` already exists; extend `AgentContextSlot` to include optional `workflowStep` for step-inside-workflow access.
- `packages/ai/src/tool.ts` — add `Tool.fromMcp(mcpTool)` factory (spec says function, not method — implement as `toolFromMcp` imported from `mcp/tool-adapter.ts`).
- `packages/ai/package.json` — add `@modelcontextprotocol/sdk` dep; `./mcp` subpath already declared. Add `@roostjs/workflow` to deps (currently peer).

## Conventions (Phase 7)

- **Naming**: Classes `PascalCase`; files `kebab-case.ts`; tests `{feature}.test.ts` under `__tests__/{subsys}/`.
- **Imports**: Relative + `.js` extension (NodeNext). `import type { X }` for type-only. Reference `@roostjs/cloudflare`/`@roostjs/workflow` via workspace deps.
- **Barrel files**: Project uses them — `mcp/index.ts`, `workflows/index.ts` OK.
- **Error handling**: Typed errors extending `Error` with `override readonly name = 'X'`. See `MissingScheduledMethodError`, `NoProviderRegisteredError`.
- **Types**: Discriminated unions for variants. WeakMap-keyed metadata on constructor for decorators.
- **Testing**: `bun:test` with `describe/it/expect/beforeEach/afterEach`.
- **Decorators**: Class decorators set in WeakMap against the constructor; method decorators receive `(target, propertyKey, descriptor)` where `target` is the prototype; we resolve via `target.constructor`.
- **Typed RPC via Proxy**: JavaScript `Proxy` with `get` trap, returning closures that encode `{method, args}` JSON.

## Risks (Phase 7)

- **CF SDK `agents` dependency still present in package.json** (MEDIUM): Spec says NOT to add but it was already added by earlier phases. Do not remove; don't depend on.
- **`@modelcontextprotocol/sdk` install** (MEDIUM): Not currently installed. Must add pinned version. Protocol types/client class may differ across versions — guard against unpinned bumps.
- **Workflow step-context injection** (HIGH): CF `WorkflowEntrypoint.run(event, step)` is called by the runtime — we cannot intercept. Our `AgentMethodWorkflow.run()` must call the original agent method with `step` injected via a well-known symbol on the args tuple so the method can access it via `getStep()` helper.
- **`WorkflowClient` binding resolution** (HIGH): Spec code snippet references `this.workflows.get(bindingName)` — but no such accessor exists on `StatefulAgent`. We'll add `this.workflows` as a `Map<string, WorkflowClient>` populated via registration helper. In tests, we use the `WorkflowFake` through `FakeWorkflowClient` or a minimal Map stub.
- **Sub-agent circular spawn** (MEDIUM): Spec says cap depth at 5. Track depth via header `x-roost-sub-agent-depth` on RPC request.
- **Abort semantics** (MEDIUM): `AbortController` on `StatefulAgent` must be checked by `prompt/stream` — P2 code doesn't do this yet. Add `this.abortSignal` accessor; leave actual checking to callers (document).
- **MCP transport in Workers** (LOW): Streamable-HTTP preferred. SSE + stdio present but stub-level in Workers.
- **Tool name collision via MCP** (LOW): When `toolFromMcp` imports a tool whose name collides with existing, emit warning.

---

## Retained — Phase 6 Sections

### Dimensions (Phase 6)

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 15/20 | Spec-template-media.md gives a clean 5-part shape instantiated 3 times. Ambiguities: (1) `CapabilityNotSupportedError` is not defined anywhere — must be added. (2) `Stringable` from Audio input is undefined in repo — spec likely means `string \| { toString(): string }`. (3) Transcription `Segment` / `DiarizedSegment` types are new. |
| Pattern familiarity | 16/20 | `RerankingBuilder` (rag/reranking/reranking.ts:51-91) is closest shape match. `BroadcastStreamJob` (streaming/broadcast-stream-job.ts:17-24) is 1:1 template for media jobs. |
| Dependency awareness | 14/20 | `AIProvider` interface extension has 6 implementors. `ProviderCapability` already includes `'image'`, `'audio'`, `'transcribe'`. |
| Edge case coverage | 14/20 | Gaps: R2 bucket binding validation, `UnsupportedOptionDropped` event missing, `.queue().then()` callback TTL in-memory only. |
| Test strategy | 15/20 | `packages/ai/__tests__/media/` doesn't exist yet. Fixtures needed. Miniflare patterns established. |

### Key Patterns (Phase 6)

- `packages/ai/src/rag/reranking/reranking.ts:51-119` — `RerankingBuilder` + static `Reranking.of/.fake/.restore/.assertReranked` namespace.
- `packages/ai/src/rag/files/files.ts:16-46` — `FilesFake` counter + `stored[]` + `deleted[]` + `records` Map pattern.
- `packages/ai/src/streaming/broadcast-stream-job.ts:17-24` — `@Queue('name') class XJob extends Job<Payload>` template.
- `packages/ai/src/queueing/callback-registry.ts:14-92` — `InMemoryCallbackRegistry` with `fulfill/reject/onFulfilled/onRejected`.
- `packages/ai/src/queueing/queue-bridge.ts:10-22` — `QueuedPromptHandle.then(cb).catch(cb)` thenable pattern.
- `packages/ai/src/agent.ts:407-448` — `dispatchQueuedPrompt` fake-shortcut + job dispatch pattern.
- `packages/ai/src/providers/openai.ts:154-170` — `async embed(req): Promise<EmbedResponse>` HTTP template.
- `packages/ai/src/events.ts:27-45, 69-77, 99-117` — Event class pattern.

## Retained — Phase 5, 4, 3, 2, 1 Sections

Phase 5 — RAG + Files + Stores + Reranking.
Phase 4 — Tools + Attachments + Queueing.
Phase 3 — Streaming + realtime + React client.
Phase 2 — Stateful agents on DOs.
Phase 1 — Foundation rewrite.
