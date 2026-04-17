# Roost AI Redesign Contract

**Created**: 2026-04-17
**Confidence Score**: 96/100
**Status**: Draft
**Supersedes**: None

## Problem Statement

`@roostjs/ai` is currently a thin Agent wrapper over Cloudflare Workers AI (Agent class with a simple multi-turn loop, a Cloudflare/Gateway provider pair, a RAG pipeline over Vectorize, and a small decorator set). It predates the now-released **Cloudflare Agents SDK**, which introduces a production-grade agent runtime layered on Durable Objects with first-class support for Sessions, Workflows, sub-agent RPC, WebSockets, MCP client/server, scheduling, HITL, memory tiers, voice, email, web browsing, agentic payments, and CodeMode. The current package cannot express any of these primitives.

Simultaneously, **Laravel 13's AI SDK** has raised the bar for DX — contracts-based agents (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions`), `RemembersConversations` persistence, attachments, streaming with Vercel protocol, broadcasting, queueing, provider tools (WebSearch/WebFetch/FileSearch), middleware, anonymous agents, failover, embeddings with caching, reranking, files, vector stores with metadata filtering, and first-class `fake()`/assertion testing infrastructure — plus Image/Audio/Transcription APIs.

Roost's north star is "the Laravel of Cloudflare Workers," and `@roostjs/ai` is the package that most directly carries that promise in the AI space. Today it meets neither bar. Users building on Roost today cannot build the kinds of agents the CF Agents SDK makes possible, and they cannot get the ergonomics Laravel developers now expect. This blocks Roost's credibility as the default stack for CF-native AI applications.

## Goals

1. **Full Laravel AI SDK ergonomic parity** in a Cloudflare Agents world — every Laravel primitive (Agents with all contracts, RAG, Files, Vector Stores, Reranking, Media, Embeddings, Streaming, Broadcasting, Queueing, Middleware, Anonymous agents, Failover, Testing) has a Roost equivalent with equivalent or better DX, implemented idiomatically for TypeScript + Cloudflare.
2. **Integrate every Cloudflare Agents SDK primitive** — Agent-on-DO, Sessions, Schedule, Workflows, Queues, WebSockets, SSE, React client SDK, McpClient, McpAgent, `createMcpHandler`, MCP portals, sub-agents RPC, HITL, memory tiers, Voice, Email, Browser, Payments (x402/MPP), and CodeMode — even where Laravel has no direct equivalent.
3. **Exhaustive testing** — >95% line/branch coverage via unit tests with fakes/stubs for every public API + edge case, plus integration tests against `miniflare` (wrangler dev simulator) exercising real Durable Object state, WebSockets, Workflows, Queues, and Vectorize emulator behavior.

## Success Criteria

- [ ] `@roostjs/ai` v0.3.0 is published with modular subpath exports: `@roostjs/ai`, `@roostjs/ai/rag`, `@roostjs/ai/media`, `@roostjs/ai/mcp`, `@roostjs/ai/testing`, `@roostjs/ai/client` (React SDK).
- [ ] **Agents**: `Agent` base class with `Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions` mixin-interfaces; `RemembersConversations` (Sessions-backed); anonymous `agent()` function; decorators `@Provider`, `@Model`, `@MaxSteps`, `@MaxTokens`, `@Temperature`, `@Timeout`, `@UseCheapestModel`, `@UseSmartestModel`. Agents run on Durable Objects when `@Stateful()` or extend `StatefulAgent`.
- [ ] **Providers**: Workers AI direct binding is the default provider; AI Gateway path for external providers is unified and routed through Gateway; opt-in native clients (`AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`) for features Gateway doesn't fully expose. Failover supported via provider array.
- [ ] **Tools**: `Tool` interface (schema + handle + description); provider tools `WebSearch`, `WebFetch`, `FileSearch`; `SimilaritySearch.usingModel()` helper for `@roostjs/orm` vector columns; middleware pipeline with `then()` hooks.
- [ ] **Sessions**: Backed by Durable Object storage; tree-structured message history; compaction; FTS over conversation content; `forUser()`, `continue(id)`, tree branching.
- [ ] **Streaming**: SSE response streams; Vercel AI SDK protocol via `.usingVercelDataProtocol()`; streaming events iterable; `broadcast()`, `broadcastNow()`, `broadcastOnQueue()` bridging to `@roostjs/broadcast`.
- [ ] **Queueing**: `queue()`, `queueAfter(seconds)`, `.then()`, `.catch()` bridging to `@roostjs/queue`. `@Queue`, `@MaxRetries`, `@Backoff` decorators work on Agents.
- [ ] **Scheduling**: Agents can `schedule(cronOrWhen, method, args)` that persists across DO evictions using CF Agents SDK scheduling primitives.
- [ ] **Workflows**: `@Workflow`-decorated agent methods execute via `@roostjs/workflow`; compensation supported; workflow handle returned.
- [ ] **Sub-agents**: `this.subAgent(AgentClass, init)`, `abortSubAgent(handle)`, `deleteSubAgent(handle)` with typed RPC.
- [ ] **MCP client**: `McpClient` consumes remote MCP servers; discovered tools auto-registered as Agent tools; `McpAgent` wraps an Agent as an MCP server via `createMcpHandler`; MCP portal composition supported.
- [ ] **HITL**: `requireApproval(step, payload)` pauses execution; resume via signal; integrates with MCP elicitation.
- [ ] **Memory tiers**: Read-only context, writable short-form memory, searchable knowledge (Vectorize-backed), on-demand skills (tool-registered).
- [ ] **Payments**: x402 and MPP primitives — `chargeForTool(tool, price)`, agent-to-agent payment invocation.
- [ ] **Voice**: `Voice.stream()` primitive over CF Realtime / Workers AI voice models.
- [ ] **Email**: `Email.send()`, inbound webhook handler wrapping CF Email Workers.
- [ ] **Browser**: `Browser.navigate(url)` tool wrapping CF Browser Rendering.
- [ ] **CodeMode**: `@CodeMode()` or `agent.codeMode()` executes agent intents as generated code inside the isolate sandbox.
- [ ] **RAG**: `RAGPipeline` (retains current shape, enhanced with namespaces + metadata filters); `Files.store()` / `fromId()` / `.put()` / `.get()` / `.delete()`; `Stores.create() / get() / .add() / .remove() / .delete()`; `Reranking.of().rerank()` with Cohere/Jina providers via Gateway; `EmbeddingPipeline` with `cache()` option (KV-backed, 30-day default TTL); `Str.toEmbeddings()` helper.
- [ ] **Media**: `Image.of(prompt).generate()` with `.square()/.portrait()/.landscape()/.quality()` and `.store()` to R2; `Audio.of(text).generate()` with `.male()/.female()/.voice()/.instructions()`; `Transcription.fromPath()/.fromStorage()/.fromUpload().generate()` with `.diarize()`. All have `.queue().then()`.
- [ ] **Attachments**: `Files.Image.fromStorage() / fromPath() / fromUrl() / fromId()`; `Files.Document.*` equivalent; `$request.file()` pass-through.
- [ ] **Anonymous agents**: `agent({ instructions, messages, tools, schema })` with full feature parity to class-based.
- [ ] **React client SDK**: `@roostjs/ai/client` — `useAgent(agentName)`, `useAgentState()`, `useAgentStream()` hooks; bidirectional state sync; connection hibernation handled.
- [ ] **Realtime**: WebSocket transport layered over `@roostjs/broadcast`'s Durable Object infrastructure; SSE fallback; hibernation.
- [ ] **Readonly connections**: Expose read-only state snapshots for observers.
- [ ] **Testing**: `Agent.fake()`, `Agent.preventStrayPrompts()`, `Image.fake()`, `Audio.fake()`, `Transcription.fake()`, `Embeddings.fake()`, `Reranking.fake()`, `Files.fake()`, `Stores.fake()`, all with `assertGenerated/assertPrompted/assertQueued/assertNotX/assertNothingX` helpers matching Laravel's surface. Fake structured-output auto-generates data from schema.
- [ ] **Events**: `PromptingAgent`, `AgentPrompted`, `StreamingAgent`, `AgentStreamed`, `InvokingTool`, `ToolInvoked`, `GeneratingImage`, `ImageGenerated`, `GeneratingAudio`, `AudioGenerated`, `GeneratingTranscription`, `TranscriptionGenerated`, `GeneratingEmbeddings`, `EmbeddingsGenerated`, `Reranking`, `Reranked`, `FileStored`, `FileDeleted`, `CreatingStore`, `StoreCreated`, `AddingFileToStore`, `FileAddedToStore`, `RemovingFileFromStore`, `FileRemovedFromStore` dispatched via `@roostjs/events`.
- [ ] **Coverage**: >95% line/branch on every `src/**/*.ts` file (excluding types, fixtures, and generated code) via `bun test --coverage`.
- [ ] **Integration tests**: All major flows exercised under `miniflare` — Agent-on-DO with persistence, WebSocket reconnect, Workflow step execution, Queue consumer, Vectorize insert+query, Sessions compaction. Runs in CI on every PR.
- [ ] **README + subpath docs**: Each subpath export has its own README section with a worked example. Root README matches Laravel docs structure (Agents → Prompting → Conversation → Structured → Attachments → Streaming → Broadcasting → Queueing → Tools → Middleware → Anonymous → Config → Providers → Media → Embeddings → Reranking → Files → Stores → Failover → Testing → Events).
- [ ] **Breaking changes documented**: `MIGRATION.md` shipped with codemod-style before/after pairs for every v0.2 public API.

## Scope Boundaries

### In Scope

**Laravel AI SDK parity groups** (all four):
- Agents core + Tools + Middleware (contracts, decorators, anonymous agents, provider options, failover)
- RAG: Embeddings (with caching) + Vector Stores (create/add/remove with metadata) + Files + Reranking + SimilaritySearch
- Media: Image generation + Audio (TTS) + Transcription (STT)
- Streaming (SSE + Vercel protocol) + Broadcasting (via `@roostjs/broadcast`) + Queueing (via `@roostjs/queue`)

**Cloudflare Agents SDK primitives** (all four):
- Core: Agent-on-DO, Sessions, Schedule, Workflows, Queues
- Realtime: WebSockets + SSE + React client SDK
- MCP: McpClient + McpAgent + createMcpHandler + portals
- Advanced: Sub-agents RPC + HITL + Memory + Payments (x402/MPP) + Voice + Email + Browser
- **CodeMode** — explicit must-ship per user answer

**Provider strategy**:
- Workers AI direct binding (default)
- AI Gateway path for external providers (default path for OpenAI/Anthropic/Gemini/etc.)
- Opt-in native client providers for features Gateway doesn't fully expose (extended thinking, reasoning tokens, native tool schemas)

**Package shape**:
- Single `@roostjs/ai` package with modular subpath exports — `@roostjs/ai`, `@roostjs/ai/rag`, `@roostjs/ai/media`, `@roostjs/ai/mcp`, `@roostjs/ai/testing`, `@roostjs/ai/client`

**Testing**:
- Unit tests, >95% line/branch coverage, bun test
- Integration tests against miniflare (wrangler dev simulator)

**Versioning**:
- Breaking rewrite shipped as v0.3.0 (pre-1.0, breaking changes allowed)
- MIGRATION.md documenting every public API change

### Out of Scope

- **E2E tests against real Cloudflare dev environment** — user explicitly chose unit + miniflare only. E2E comes later if needed.
- **pgvector / Postgres parity** — Roost is Cloudflare-native; D1+Vectorize is the storage model. Laravel's `whereVectorSimilarTo` is replicated via `@roostjs/orm` + Vectorize, not pgvector.
- **Eloquent-equivalent magic on vector queries** — `SimilaritySearch.usingModel()` works against `@roostjs/orm` models, but we don't ship a pgvector compatibility shim.
- **Custom fine-tuning / model training pipelines** — use the model, don't train it.
- **Non-CF provider storage backends** — Files/Stores go through CF providers (R2 + Vectorize + Workers AI) or external providers via Gateway. No self-hosted fallback.
- **v0.2 API compatibility layer** — breaking rewrite. Codemod-style migration guide, not a runtime shim.
- **Automatic codemod script** — documented migration only; a codemod tool is future work.

### Future Considerations

- E2E test harness against real CF dev environment (on-demand CI job)
- Automated codemod script for v0.2 → v0.3 migration
- Additional native provider adapters beyond Anthropic/OpenAI/Gemini (Groq, xAI, DeepSeek, Mistral, Ollama, ElevenLabs)
- Self-hosted Ollama provider for local development
- Advanced eval harness with recorded fixtures (VCR-style cassettes) — deferred from v0.3
- Vector store abstractions over Postgres/pgvector for users running hybrid deployments
- Fine-tuning pipelines and model registry integration
- Observability dashboards and Grafana templates for agent telemetry

## Execution Plan

_Added during handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
P1: Foundation Rewrite  ──── (blocks everything)
     │
     ├── P2: Stateful on DO  ─────────┐
     │        │                       │
     │        ├── P3: Streaming + RT + React
     │        │
     │        └── P7: Workflows + Sub-agents + MCP
     │                 │
     │                 └── P8: Advanced CF Primitives  (also depends on P2)
     │
     ├── P4: Tools + Attachments + Queueing
     │        │
     │        └── P5: RAG + Files + Stores + Reranking
     │
     └── P6: Media  (template + delta)

P9: Ship Polish  (blocked by ALL)
```

### Execution Steps

**Strategy**: Hybrid — sequential foundation, then two parallel waves via agent team, then solo polish.

1. **Wave 1 — Phase 1 Foundation** _(sequential, blocks all)_
   ```bash
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-1.md
   ```

2. **Wave 2 — Phases 2, 4, 6 in parallel** _(agent team of 3)_
   See "Agent Team Prompt — Wave 2" below. Or sequentially:
   ```bash
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-2.md
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-4.md
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-6.md
   ```

3. **Wave 3 — Phases 3, 5, 7 in parallel** _(agent team of 3; P3 needs P2, P5 needs P4, P7 needs P2)_
   See "Agent Team Prompt — Wave 3" below. Or sequentially:
   ```bash
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-3.md
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-5.md
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-7.md
   ```

4. **Wave 4 — Phase 8 Advanced Primitives** _(solo; blocked by P7)_
   ```bash
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-8.md
   ```

5. **Wave 5 — Phase 9 Ship Polish** _(solo; blocked by all)_
   ```bash
   /execute-spec docs/ideation/roost-ai-redesign/spec-phase-9.md
   ```

### Agent Team Prompt — Wave 2

_Paste into a fresh Claude Code session in delegate mode (Shift+Tab) after Phase 1 is merged._

```
You are the lead of a 3-teammate agent team executing Wave 2 of the roost-ai-redesign project. Read docs/ideation/roost-ai-redesign/contract.md for scope. Phase 1 is already complete on main.

Spawn three teammates in parallel and assign one spec each:

1. Teammate A: docs/ideation/roost-ai-redesign/spec-phase-2.md  (Stateful Agents on DO)
2. Teammate B: docs/ideation/roost-ai-redesign/spec-phase-4.md  (Tools + Attachments + Queueing)
3. Teammate C: docs/ideation/roost-ai-redesign/spec-phase-6.md  (Media; uses spec-template-media.md)

Each teammate should:
- Run /execute-spec against their assigned file.
- Work on a feature branch: phase-{N}-{kebab-name}.
- Open a PR against main when complete.
- Coordinate on shared files: packages/ai/src/agent.ts, packages/ai/src/types.ts, packages/ai/src/provider.ts, packages/ai/src/decorators.ts, packages/ai/src/tool.ts, packages/ai/src/providers/interface.ts, packages/ai/src/providers/anthropic.ts, packages/ai/src/providers/openai.ts, packages/ai/src/providers/gemini.ts, packages/ai/src/providers/workers-ai.ts, packages/ai/src/events.ts, packages/ai/package.json. Only one teammate should modify a shared file at a time. Use task messages to coordinate — "I'm about to edit src/providers/interface.ts" before editing.

As lead, synthesize: review each PR for spec fidelity, ensure test coverage stays above the 95% gate introduced in Phase 1, approve merges in dependency-safe order (P2 first is fine, P4 and P6 second in any order). Report waves complete when all three PRs are merged.
```

### Agent Team Prompt — Wave 3

_Paste into a fresh Claude Code session in delegate mode (Shift+Tab) after Wave 2 is merged._

```
You are the lead of a 3-teammate agent team executing Wave 3 of the roost-ai-redesign project. Read docs/ideation/roost-ai-redesign/contract.md for scope. Phases 1, 2, 4, 6 are complete on main.

Spawn three teammates in parallel and assign one spec each:

1. Teammate A: docs/ideation/roost-ai-redesign/spec-phase-3.md  (Streaming + Realtime + React Client)
2. Teammate B: docs/ideation/roost-ai-redesign/spec-phase-5.md  (RAG + Files + Stores + Reranking)
3. Teammate C: docs/ideation/roost-ai-redesign/spec-phase-7.md  (Workflows + Sub-agents + MCP)

Each teammate should:
- Run /execute-spec against their assigned file.
- Work on a feature branch: phase-{N}-{kebab-name}.
- Open a PR against main when complete.
- Coordinate on shared files: packages/ai/src/stateful/agent.ts (P3+P7), packages/ai/src/providers/interface.ts (P5+P6 history), packages/ai/src/providers/*.ts (P3+P5 modify streaming + embed), packages/ai/src/events.ts (all three add events), packages/ai/src/decorators.ts (P7 adds @Workflow/@SubAgentCapable), packages/ai/src/provider.ts (P5+P7 wire services), packages/ai/package.json (P3+P5+P7 all add subpaths/deps). Only one teammate should modify a shared file at a time. Announce intent via task message before editing.

As lead, review each PR for spec fidelity, verify coverage gate stays green, and approve merges. Report wave complete when all three PRs are merged. Then unblock Wave 4 (Phase 8, solo).
```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
