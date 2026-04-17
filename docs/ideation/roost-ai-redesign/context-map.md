# Context Map: roost-ai-redesign

**Phase**: 1 (Foundation Rewrite)
**Scout Confidence**: 82/100
**Verdict**: GO

## Dimensions

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 18/20 | Spec enumerates 28 new files and 7 modified files with purpose. Minor ambiguity: `StreamableAgentResponse` shipped as interface in P1 but impl in P3 — builder needs to decide type-only placeholder vs abstract. |
| Pattern familiarity | 17/20 | All referenced pattern files read. Subpath-exports gap: **no package in the monorepo currently uses subpath `exports` field** — all use a single `.` entry. Builder follows Node.js `exports` spec from scratch. |
| Dependency awareness | 18/20 | Blast radius mapped: 2 runtime consumers (`examples/ai-chat/app/agents/chat-assistant.ts`, `packages/cli/src/commands/make.ts` scaffold) + docs + CLI generator test. Subpath exports have zero current consumers — safe to introduce. |
| Edge case coverage | 15/20 | Gaps: (a) `Agent.fake()` WeakMap keyed by constructor — anonymous agents each create new class per call; (b) decorators on anonymous classes are unreachable; (c) `@Provider([Lab, Lab])` failover coercion rules. |
| Test strategy | 14/20 | `bun test` is convention. `gateway.test.ts` shows `spyOn(globalThis, 'fetch')` pattern. **No coverage tool wired** — spec says ">95%" but no config exists yet. No miniflare for P1 (correctly deferred to P2). |

## Key Patterns

- `packages/ai/src/providers/interface.ts` (lines 1-7) — minimal `AIProvider` with `name`, `chat`, optional `stream`. Builder extends to `capabilities()`, optional `embed/rerank/image/audio/transcribe`, `files`, `stores`. JSDoc-free, `type` imports.
- `packages/ai/src/agent.ts` (lines 1-218) — current v0.2 Agent. WeakMap fake/provider pattern (lines 7-8), `getAgentConfig` merge (line 44), tool loop (lines 74-108), fake subclass (lines 168-199), anonymous `agent()` stub (lines 201-218). `HasTools`/`HasStructuredOutput` live here today (lines 14-20) — move to `contracts.ts`.
- `packages/queue/src/decorators.ts` (lines 1-37) — canonical decorator pattern: `ensureConfig(target)` mutating `target._jobConfig`. AI uses separate `WeakMap<Function, AgentConfig>` (line 3) style — **match existing AI style for package consistency**.
- `packages/broadcast/src/fake.ts` + `packages/events/src/fake.ts` — thin `recordDispatch(event)` + public array.
- `packages/events/src/event.ts` (lines 1-58) — assertion pattern: static methods on abstract class, WeakMap<Function, EventFake>. `assertDispatched(callback?)` throws with dispatched-list message. Builder replicates for `Agent.assertPrompted/assertQueued/assertNotPrompted/assertNothingPrompted`.
- `packages/events/src/dispatcher.ts` (lines 1-64) — singleton via `EventDispatcher.get/set()`. Peer-dep lazy-load of `@roostjs/queue` + `@roostjs/broadcast` — template for how new AI events dispatch without hard-coupling.
- `packages/ai/src/providers/gateway.test.ts` (lines 1-132) — `spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)` pattern. All new native-provider tests mirror this.
- `packages/ai/__tests__/agent.test.ts` (lines 1-120) — `MockProvider` class + `TestAgent extends Agent`. Builder creates `agent.foundation.test.ts` **alongside**; existing file needs updating.

## Dependencies

- `packages/ai/src/agent.ts:22` (`Agent` class) — consumed by `packages/ai/src/provider.ts:5,36`, `examples/ai-chat/app/agents/chat-assistant.ts:1,37`, `packages/cli/src/commands/make.ts:41`, `packages/cli/__tests__/generators.test.ts:42`, existing AI tests, and 7 `.mdx` docs.
- `packages/ai/src/providers/interface.ts:3` (`AIProvider`) — consumed by `providers/cloudflare.ts`, `providers/gateway.ts`, `provider.ts`, `agent.ts`, tests.
- `packages/ai/src/providers/cloudflare.ts` (renames to `workers-ai.ts`) — consumed by `provider.ts:3,9,24`, `providers/gateway.ts:3,35`, `providers/gateway.test.ts:3,6`.
- `packages/ai/src/index.ts` — external runtime consumers: `examples/ai-chat/app/agents/chat-assistant.ts` + `packages/cli/src/commands/make.ts`. Docs break silently.
- `packages/ai/src/types.ts` — internal only. `PromptResult` discriminated union (line 38-40) must survive.
- `packages/ai/src/rag/*` — **out of scope for P1** but current `index.ts:26-40` re-exports RAG from root. After rewrite, users must import from `@roostjs/ai/rag` subpath.

## Conventions

- **Naming**: Classes `PascalCase`, files `kebab-case.ts`. Tests either co-located (`.test.ts`) or under `__tests__/` — spec uses `__tests__/` for foundation tests.
- **Imports**: Relative with `.js` extension (NodeNext/ESM). `import type { X }` for type-only. Barrel files OK in AI package (already has them).
- **Error handling**: Typed errors extending `Error`; `this.name = 'ClassName'`. Spec names: `NoProviderRegisteredError`, `AllProvidersFailedError`, `StructuredOutputValidationError`.
- **Types**: `interface` for shapes, `type` for unions. User rule prefers `unknown` over `any` — new guards use `unknown`.
- **Testing**: `bun:test` (`describe`, `it`, `expect`). `spyOn(globalThis, 'fetch')` for HTTP. No external mocking lib.
- **Decorators**: Function-returning-function; AI uses `WeakMap<Function, AgentConfig>`. Keep this style.
- **Fakes**: Static on class, `WeakMap<Function, Fake>` keyed by constructor; `static fake()` installs, `static restore()` removes.

## Risks

- **Subpath-exports unprecedented in monorepo**: No in-repo template. `packages/ai/tsconfig.json` may need updating for NodeNext resolution of new subpaths.
- **CLI test tripwire**: `packages/cli/__tests__/generators.test.ts:42` asserts scaffold contains `"import { Agent } from '@roostjs/ai'"` literal. Rename-safe only if `Agent` export name preserved.
- **Index.ts rewrite breaks docs**: 7 `.mdx` + `README.md` hard-code imports. Part of Phase 9 migration, so deferring is correct — but builder won't get a green-doc signal.
- **Anonymous agent + decorators unreachable**: `agent()` creates inline class; decorators can't target it. Anonymous path must bypass decorator config entirely — route everything through options bag.
- **WeakMap<Function, AgentFake> vs anonymous**: Each `agent()` call constructs new class → per-class fakes won't compose. For anonymous, install fake on instance.
- **StreamableAgentResponse phase-split**: Listed in P1 New Files but impl in P3. Ship as type-only or abstract stub with TODO.
- **Existing `agent.test.ts` / `agent.queued.test.ts`**: Both assume current `PromptResult` union shape. Builder must EITHER preserve union OR rewrite these two files. Not in New/Modified/Deleted — treat as Modified.
- **Capability table staleness**: Spec flags manual curation. Ship seed table with pinned model IDs + test fixture.
- **No coverage harness in repo**: Spec demands >95% but P1 doesn't add it. Defer to P9.
- **No miniflare in P1**: Integration lands in P2. Resist DO mocking; pure unit + `spyOn(fetch)` only.
