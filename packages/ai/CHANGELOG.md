# Changelog

All notable changes to `@roostjs/ai` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-20

v0.3.0 is a breaking rewrite aligning `@roostjs/ai` with Cloudflare Agents SDK
primitive semantics and Laravel 13's AI SDK ergonomics. See
[MIGRATION.md](./MIGRATION.md) for upgrade notes.

### Added

- **Stateful agents on Durable Objects** (`StatefulAgent`, `@Stateful({binding})`).
- **Sessions API** — tree-structured message history, compaction, FTS.
- **Schedule** — `agent.schedule(cron|delay, method, payload)` + `@Scheduled(cron)`.
- **Workflows** — `@Workflow()` method decorator backed by `@roostjs/workflow`.
- **Typed sub-agent RPC** — `this.subAgent(OtherAgent)` over DO `fetch`.
- **MCP** — `McpClient`, `McpAgent`, `createMcpHandler`, `McpPortal`, tool adapter.
- **HITL** — `requireApproval` + `approve` state machine, MCP elicitation bridge, `@RequiresApproval(step)`.
- **Four-tier Memory** — `agent.memory.{context, shortForm, knowledge, skills}`.
- **Payments** — x402 `chargeForTool`, MPP `payAgent`, `InMemoryWallet`, `NonceLedger`.
- **Voice** — `Voice.stream()` with pluggable transcribe/synthesize and in-memory realtime bridge.
- **Email** — `Email.send()` + `createEmailHandler()` inbound routing.
- **Browser** — `Browser.navigate()` + `Browser.asTool()` wrapping a pluggable driver.
- **CodeMode** — `runCodeMode()` + `@CodeMode()` with `InProcessSandbox` (dev) and intent-hash cache.
- **Native provider adapters**: `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `FailoverProvider`.
- **Provider tools**: `WebSearch`, `WebFetch`, `FileSearch`.
- **Attachments**: `Files.Image` / `Files.Document` with 6 constructor modes.
- **Media builders**: `Image.of()`, `Audio.of()`, `Transcription.fromPath/fromStorage/fromUpload`.
- **RAG**: `RAGPipeline` with namespaces + metadata filters, `Files` / `Stores`, `EmbeddingPipeline` with KV cache, `Reranking.of()`, `SimilaritySearch.usingModel()`.
- **React client SDK** — `useAgent`, `useAgentState`, `useAgentStream`, `RoostAgentProvider`, SSE + WebSocket transports.
- **Vercel AI SDK protocol streaming** — `.usingVercelDataProtocol()`.
- **WebSocket transport** via `@roostjs/broadcast` DO infrastructure.
- **Anonymous agents** — `agent({instructions, messages, tools, schema})`.
- **Testing**: `Agent.fake()`, `Image/Audio/Transcription/Embeddings/Reranking/Files/Stores.fake()`, `preventStrayPrompts()`, auto-fake structured output.
- **Events**: 30+ event classes across prompting, streaming, tools, providers, RAG, media, HITL, payments, voice, email, browser, code-mode.
- **Modular subpath exports**: `/rag`, `/media`, `/media/image`, `/media/audio`, `/media/transcription`, `/mcp`, `/testing`, `/client`, `/stateful`, `/hitl`, `/memory`, `/payments`, `/voice`, `/email`, `/browser`, `/code-mode`.

### Changed

- `Agent` base class uses opt-in contracts (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions`).
- `@Provider()` accepts provider arrays for failover.
- `StreamEvent` is now a discriminated union (alpha.3+).
- `@Model()` accepts provider-scoped names (`anthropic/claude-...`).
- Default package entrypoint tree-shakes better via subpath exports.

### Removed

- `CloudflareAIProvider` (renamed to `WorkersAIProvider` — hard remove, no deprecation shim).
- Inline `messages` / `tools` / `schema` fields on v0.2 `Agent` (moved to opt-in contracts).
- `queued: true` option on `.prompt()` (replaced by `.queue()` thenable).

### Breaking

See [MIGRATION.md](./MIGRATION.md) for the full before/after list with regex
recipes and rationale per change.

### Internal

- Adopted `bun test --coverage` with LCOV output configured in `bunfig.toml`.
- `scripts/coverage-gate.ts` parses LCOV and enforces a configurable threshold
  against `packages/ai/src/**` (excluding `src/client/`, `__tests__/`, `dist/`,
  `scripts/`). Expose via `bun run test:coverage:gate`.
  - v0.3.0 ships the gate infrastructure; enforcement at the 95% threshold is
    an ongoing ramp — targeted gap-closing tests land in v0.3.1.
  - Coverage is measured against the default test suite only; combining LCOV
    across the three invocations (default, `test:client`, `test:integration`)
    is tracked in v0.3.1 alongside CI wiring.
- Split test runner: default `bun run test` + `bun run test:client`
  (happy-dom preloaded) + `bun run test:integration`. `bun run test:all`
  runs all three in sequence.
- `@modelcontextprotocol/sdk@1.22.0` pinned as a hard dependency.
- `@roostjs/workflow` promoted from peer → hard dependency.
