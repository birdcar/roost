# Implementation Spec: Roost AI Redesign - Phase 9 (Ship Polish)

**Contract**: ./contract.md
**Depends on**: All prior phases (1-8)
**Estimated Effort**: M

## Learnings from prior phases — incorporated into this spec

1. **Coverage harness doesn't exist yet**. P1/P2/P3 all carried "no coverage tool wired" forward. P9 OWNS the decision: adopt `bun test --coverage` (built-in, no extra dep) + an LCOV-parsing gate script. The >95% target in the contract stays; this phase enforces it for the first time.
2. **Test-runner split for React hook tests** — P3 attempted `@happy-dom/global-registrator` + `@testing-library/react` alongside the rest of `bun test packages/ai/` and discovered that happy-dom's global `fetch` replacement interferes with `spyOn(globalThis, 'fetch')` in non-DOM tests. P3 shipped the React hooks untested at the hook level; P9 must restore coverage for them via a separate `test:client` script that runs under a preloaded happy-dom environment in its own invocation.
3. **StreamEvent discriminated union** — P3 migrated `StreamEvent` from the P1 flat shape to a discriminated union. Zero consumers at the time, but MIGRATION.md must document the change for anyone who tracked `-alpha.1` or held a direct reference to `@roostjs/ai`'s type exports during the alpha series.
4. **Roost-native StatefulAgent / sub-agents / MCP** — the spec evolved away from "extends CF Agents SDK `Agent<Env>`" in P2 and P7. The contract's Success Criteria claim "Integrate every Cloudflare Agents SDK primitive" needs a softer restatement: we integrate the primitives' *semantics* (Sessions, Schedule, Sub-agents, MCP) via Roost-native implementations, not by inheriting the SDK's base classes. The README + MIGRATION.md should frame this as an intentional architectural choice.
5. **Miniflare integration scope** — P2 and P3 integration tests ran against inline Worker scripts, not against bundled `@roostjs/ai` code. The consolidated `test:integration` harness in §4 should either (a) ship an esbuild-driven bundle step so miniflare tests exercise the real package, or (b) explicitly document that integration tests validate contracts (storage layout, SSE wire format, DO alarm semantics) rather than the full import graph. Lean toward (b) + a follow-up (`v0.3.1`) for (a).

## Technical Approach

Phase 9 takes the feature-complete `@roostjs/ai` v0.3.0-alpha and ships it as v0.3.0. This phase is primarily documentation, coverage auditing, integration test consolidation, and release mechanics. No new runtime behavior — everything added here is developer-facing.

Four workstreams:

1. **MIGRATION.md**: Codemod-style before/after pairs for every v0.2 → v0.3 API change, grouped by feature (Agent, Providers, RAG, Tools, Testing, Events). Includes sed/regex recipes users can run manually since an automated codemod is deferred (per contract).

2. **README rewrite**: Root README restructured to match the Laravel AI SDK docs TOC (Introduction → Installation → Configuration → Custom Base URLs → Provider Support → Agents (with all sub-sections) → Images → Audio → Transcriptions → Embeddings → Reranking → Files → Vector Stores → Failover → Testing → Events). Per-subpath READMEs at `packages/ai/src/{rag,media,mcp,testing,client}/README.md` with worked examples for each major primitive in that subpath.

3. **Coverage audit**: Run `bun test --coverage`, identify files below 95% line/branch, write gap-closing tests. Set CI gate at 95% threshold; failing PR on regression.

4. **Integration test suite in miniflare**: Consolidate per-phase integration tests into a `bun test:integration` script that spins up miniflare, runs all DO/Workflow/Queue/Vectorize/WS scenarios, tears down cleanly. Add this to CI as a required check.

## Feedback Strategy

**Inner-loop command**: `bun test --coverage packages/ai/` (for coverage gap loop) and `bun run build` (for package verification)

**Playground**: Docs generation output + coverage report. Writing docs benefits from reading the implementation; coverage loop is test-driven.

**Why this approach**: Docs + polish benefit from iterative reading/writing cycles. Coverage is mechanical — run, inspect, add tests, repeat.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/MIGRATION.md` | v0.2 → v0.3 migration guide |
| `packages/ai/src/rag/README.md` | RAG subpath docs with examples |
| `packages/ai/src/media/README.md` | Media subpath docs |
| `packages/ai/src/mcp/README.md` | MCP subpath docs |
| `packages/ai/src/testing/README.md` | Testing subpath docs |
| `packages/ai/src/client/README.md` | React client SDK docs |
| `packages/ai/scripts/coverage-gate.ts` | Coverage threshold enforcer for CI |
| `packages/ai/scripts/integration-harness.ts` | Miniflare setup + teardown wrapper |
| `packages/ai/CHANGELOG.md` | v0.3.0 changelog entry |
| `packages/ai/__tests__/client/happy-dom-preload.ts` | Preload that registers `@happy-dom/global-registrator` before React test modules import. Consumed by `test:client` script only — must not be loaded in the default `test` invocation |
| `packages/ai/bunfig.toml` | `[test] preload = ["./__tests__/client/happy-dom-preload.ts"]` scoped to the `test:client` script via its own CWD (or a bunfig flag) |
| `packages/ai/__tests__/client/use-agent.test.tsx` | React hook unit tests restored under the split runner (P3 skipped these; P9 owns the restoration) |
| `packages/ai/__tests__/client/use-agent-stream.test.tsx` | Ditto |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/README.md` | Full rewrite matching Laravel AI docs structure |
| `packages/ai/package.json` | Bump to `0.3.0`; remove `-alpha` tag; add `test:integration`, `test:coverage`, and `test:client` scripts. Add `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/dom` as `devDependencies` (restored from P3 removal) |
| `.github/workflows/ci.yml` (or equivalent) | Add coverage gate + integration tests + client tests (separate job) to required checks |
| Every `src/**/*.ts` below 95% coverage | Add targeted tests closing gaps |

## Implementation Details

### 1. MIGRATION.md Structure

**Pattern to follow**: Laravel upgrade guides — grouped by impact + side-by-side code examples.

**Overview**: One section per major API change, with: what changed, why, before code, after code, optional sed/regex recipe.

```markdown
# Migrating from @roostjs/ai v0.2 to v0.3

## Breaking Changes Summary
- Agent class contracts
- Provider registration
- Streaming API
- RAG pipeline namespaces
- ...

## Agents

### `Agent.prompt()` return type
**Before (v0.2)**: `Promise<{ queued: boolean; text: string; ... } | { queued: true; taskId: string }>`
**After (v0.3)**: `Promise<AgentResponse>` (discriminant unified; `.queued` removed — use `.queue()` for queueing)

Before:
\`\`\`ts
const result = await new SupportAgent().prompt('Help', { queued: true });
if (result.queued) console.log(result.taskId);
\`\`\`

After:
\`\`\`ts
const handle = new SupportAgent().queue('Help').then(r => console.log(r.text));
\`\`\`

Regex recipe:
\`\`\`
grep -n "\.prompt(.*{ queued: true }" packages/**/*.ts
\`\`\`

### `@Model` now accepts provider-scoped names
...

### `StreamEvent` migrated to discriminated union (v0.3.0-alpha.3+)

**Before (v0.3.0-alpha.1/.2)**: flat shape
\`\`\`ts
interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'usage' | 'error' | 'done';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  usage?: Usage;
  message?: string;
  code?: string;
}
\`\`\`

**After (v0.3.0)**: discriminated union — narrow on \`type\` before accessing payload fields.
\`\`\`ts
type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };
\`\`\`

Regex recipe for direct field access:
\`\`\`
grep -rnE "\.toolCall\b|\.toolResult\b|\.message\?" packages/**/*.ts | grep StreamEvent
\`\`\`
```

**Implementation steps**:
1. Enumerate every v0.2 public API in `packages/ai/src/index.ts`.
2. For each, write before/after pair + rationale.
3. Group: Agents, Providers, Tools, RAG, Testing, Events, Types.
4. Add quick-scan "Breaking Changes Summary" table at top.

**Feedback loop**: Read existing v0.2 code; write migration notes; verify against v0.3 exports.

### 2. README Rewrite

**Pattern to follow**: Laravel AI SDK docs structure verbatim (we adopted Laravel ergonomics; documentation should mirror user expectations).

**Overview**: Single `packages/ai/README.md` at root matching Laravel's TOC. Each subpath gets its own README with deep-dive examples.

Sections (mirroring Laravel):
- Introduction
- Installation + config
- Custom base URLs (Gateway pattern)
- Provider Support table
- Agents
  - Prompting
  - Conversation Context (Sessions)
  - Structured Output
  - Attachments
  - Streaming (+ Vercel protocol)
  - Broadcasting
  - Queueing
  - Tools (user + provider)
  - Middleware
  - Anonymous Agents
  - Agent Configuration (decorators)
  - Provider Options
- Images
- Audio (TTS)
- Transcription (STT)
- Embeddings (+ caching)
- Reranking
- Files
- Vector Stores
- Failover
- Testing (all feature fakes)
- Events
- CF-native additions (NEW section): Stateful Agents, Sessions, Workflows, Sub-agents, MCP, HITL, Payments, Voice, Email, Browser, CodeMode

**Implementation steps**:
1. Outline TOC matching Laravel + append CF-native section.
2. Write each section with a minimal working example.
3. Cross-link to subpath READMEs for deeper dives.
4. Add a "Philosophy" note up top clarifying Laravel-parity + CF-native stance.

**Feedback loop**: Run each example mentally against the spec; adjust if API changed during implementation.

### 3. Coverage Audit + Gate

**Overview**: `bun test --coverage packages/ai/` produces LCOV-format output; a small script parses it, identifies files below 95% line/branch, reports gaps.

```typescript
// packages/ai/scripts/coverage-gate.ts
import { readFileSync } from 'node:fs';

const lcov = readFileSync('./packages/ai/coverage/lcov.info', 'utf-8');
const records = parseLcov(lcov);
const threshold = 95;

const failing = records.filter(r => r.lineCoverage < threshold || r.branchCoverage < threshold);
if (failing.length > 0) {
  console.error(`Coverage gate failed: ${failing.length} files below ${threshold}%`);
  for (const f of failing) console.error(`  ${f.file}: lines=${f.lineCoverage}% branches=${f.branchCoverage}%`);
  process.exit(1);
}
```

**Implementation steps**:
1. Run coverage once; catalogue gaps.
2. Write targeted tests closing each gap.
3. Add `bun run test:coverage` script invoking `bun test --coverage` + the gate script.
4. Wire into CI as required check.

**Feedback loop**: `bun run test:coverage`; inspect gap report; write tests; repeat.

### 3.5. Test Runner Split — React Hook Tests

**Overview**: Split the test suite into three scripts that run in separate `bun test` invocations so happy-dom's global pollution never interferes with fetch-spy assertions in the non-DOM suite.

```json
// package.json scripts
{
  "test": "bun test packages/ai/__tests__ packages/ai/src --exclude __tests__/client --exclude __tests__/integration",
  "test:client": "bun test packages/ai/__tests__/client",
  "test:integration": "bun test packages/ai/__tests__/integration",
  "test:coverage": "bun test --coverage packages/ai/ && bun run scripts/coverage-gate.ts",
  "test:all": "bun run test && bun run test:client && bun run test:integration"
}
```

The `test:client` script preloads `__tests__/client/happy-dom-preload.ts`, which registers DOM globals BEFORE any React test module loads. `@testing-library/react` + `@happy-dom/global-registrator` are reinstated as `devDependencies` here (P3 removed them because they broke the single-runner flow).

**Key decisions**:
- **Three invocations, not one** — `bun test` shares global state across files in a single invocation. Happy-dom's `fetch` replacement is global and affects every subsequent file once registered. Separate invocations give each suite a clean runtime.
- **`test:all` for CI** — runs all three in sequence. Local dev can target one.
- **Coverage combines** — `bun test --coverage` across the whole package is still feasible because each invocation writes to the same LCOV file via `append: true`, then the gate script reads the union. If bun doesn't support append, run each invocation with a distinct coverage dir and union them in `coverage-gate.ts`.

**Implementation steps**:
1. Write `happy-dom-preload.ts` with `GlobalRegistrator.register()` at module top (runs before `@testing-library/react` imports).
2. Author `bunfig.toml` with `[test] preload = [...]` scoped to the package.
3. Restore the two React-hook test files removed in P3 (`use-agent.test.tsx`, `use-agent-stream.test.tsx`).
4. Wire all three scripts into CI.

**Feedback loop**: `bun run test:client` for hook iteration; `bun run test:all` before merge.

### 4. Integration Test Suite

**Overview**: All per-phase `integration/*.miniflare.test.ts` files run together under a single harness that shares miniflare lifecycle.

```typescript
// packages/ai/scripts/integration-harness.ts
import { Miniflare } from 'miniflare';

let mf: Miniflare;

export async function setup() {
  mf = new Miniflare({
    modules: true,
    script: /* bundled test entrypoint */,
    bindings: { /* AI, VECTORIZE, KV, R2, Queues, DO namespaces */ },
  });
  await mf.ready;
}

export async function teardown() {
  await mf?.dispose();
}
```

**Implementation steps**:
1. Aggregate all integration tests.
2. Write harness with shared miniflare instance.
3. Add `test:integration` script.
4. Add to CI with timeout generous enough for DO/Workflow tests.

**Feedback loop**: `bun run test:integration`.

### 5. Changelog + Release

**Overview**: `CHANGELOG.md` entry summarizing every feature, breaking change, deprecation.

```markdown
## [0.3.0] - 2026-MM-DD

### Added
- Stateful Agents on Durable Objects (P2)
- Sessions API with tree-structured messages and compaction
- @Workflow method decorator backed by @roostjs/workflow
- Typed sub-agent RPC via subAgent()
- McpClient + McpAgent + createMcpHandler for bidirectional MCP
- MCP portal composition
- HITL requireApproval + resume signal
- Four-tier Memory (context, short-form, knowledge, skills)
- x402 chargeForTool + MPP agent-to-agent payments
- Voice.stream() over CF Realtime
- Email.send() + inbound handler
- Browser.navigate() + Browser.asTool()
- @CodeMode() decorator + sandboxed execution
- Native provider adapters: Anthropic, OpenAI, Gemini
- FailoverProvider
- Provider tools: WebSearch, WebFetch, FileSearch
- Attachments: Files.Image/Document with 6 constructor modes
- Media builders: Image.of(), Audio.of(), Transcription.fromX()
- Files + Stores API
- Reranking + Collection macro
- SimilaritySearch.usingModel() @roostjs/orm integration
- EmbeddingPipeline KV-backed cache + Str.toEmbeddings
- React client SDK: useAgent, useAgentState, useAgentStream
- Vercel AI SDK protocol streaming
- WebSocket transport via @roostjs/broadcast
- AgentFake with preventStrayPrompts + structured-output auto-fake
- 20+ Event classes across all primitives

### Changed
- Agent base class uses opt-in contracts (Conversational, HasTools, HasStructuredOutput, HasMiddleware, HasProviderOptions)
- Decorators accept provider arrays for failover
- CloudflareAIProvider renamed to WorkersAIProvider
- Package now uses modular subpath exports

### Removed
- CloudflareAIProvider (renamed; re-exported with deprecation notice in v0.3.0, removed in v0.4)
- Inline messages on v0.2 Agent (use Conversational contract)
- `queued: true` option on prompt() (use .queue())

### Breaking
- See MIGRATION.md for full list
```

**Implementation steps**:
1. Walk `src/index.ts` diff vs v0.2.
2. Classify each change.
3. Write entry.
4. Tag + publish flow.

## Testing Requirements

### Unit Tests

No new feature unit tests in this phase — only coverage-closing tests for files below 95%.

### Integration Tests

Run consolidated `bun run test:integration`.

### Manual Testing

- [ ] Install `@roostjs/ai@0.3.0` in a fresh project; walk through README's "Getting Started".
- [ ] Import each subpath (`@roostjs/ai`, `@roostjs/ai/rag`, `@roostjs/ai/media`, `@roostjs/ai/mcp`, `@roostjs/ai/testing`, `@roostjs/ai/client`); verify types resolve.
- [ ] Run `wrangler dev` with a StatefulAgent; verify hot reload + DO binding.
- [ ] Publish a dry-run to npm (`npm publish --dry-run`) and inspect tarball contents.
- [ ] Verify MIGRATION.md examples run as written.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Coverage below 95% on a file | CI fails PR; developer adds tests |
| Integration tests time out | Harness emits per-test timings; isolate slow tests |
| Dry-run publish includes unexpected files | Tighten `files` array in package.json |
| Docs example out of date vs impl | Doctest-style snippet extraction (stretch) or manual audit |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Coverage gate | Line-only coverage passes, branch fails | Test covers happy path only | False confidence | Enforce both line AND branch at 95% |
| Integration harness | Port conflicts in CI | Parallel job on same runner | Flaky tests | Dynamic port allocation |
| MIGRATION.md | Users miss a breaking change | Incomplete enumeration | Upgrade breaks | Cross-reference against public exports diff tool |
| README | Example drift | API evolves post-doc write | Misinformation | Add doc-test script that compiles examples |
| Release | Missing file in tarball | `files` array too restrictive | Import fails after publish | Dry-run check in CI before tag |

## Validation Commands

```bash
# Type checking
bun run --filter @roostjs/ai typecheck

# Full test suite (unit + coverage gate)
bun run test:coverage

# React hook tests (separate invocation — happy-dom preloaded)
bun run test:client

# Integration
bun run test:integration

# All three, sequenced (matches CI)
bun run test:all

# Build verification
bun run --filter @roostjs/ai build

# Publish dry-run
npm publish --dry-run packages/ai/

# Changelog lint
# (optional) conventional-changelog presence
```

## Rollout Considerations

- **Release plan**:
  1. Tag `v0.3.0-rc.1` on main.
  2. Dogfood in a sample app (examples/ai-demo) for 1 week.
  3. Tag `v0.3.0` on main; publish.
  4. Post release notes + migration summary.
- **Monitoring**: Watch npm download stats + issue tracker post-release.
- **Rollback**: Users pin `0.2.x` until they migrate; no forced upgrade.

## Open Items

- [ ] Decide whether to ship a deprecated `CloudflareAIProvider` re-export in v0.3.0 (removed in v0.4) vs hard-remove. Lean: soft-deprecate for one version.
- [ ] Doc-test script for README examples — stretch goal; defer if time-constrained.
- [ ] Decide release channel — `@latest` vs `@next` for initial v0.3.0. Lean: `@next` for 1 week, then `@latest`.
- [ ] Coverage union across the three invocations — confirm `bun test --coverage` supports append, otherwise implement per-invocation LCOV merge in `coverage-gate.ts`.
- [ ] Miniflare tests bundling `@roostjs/ai` source — if we go with option (b) in learning #5 for v0.3.0, schedule the bundled variant for v0.3.1.
- [ ] Soften "Integrate every Cloudflare Agents SDK primitive" in the contract's Success Criteria to "Integrate Cloudflare Agents SDK primitive *semantics* (Sessions, Schedule, Sub-agents, MCP) via Roost-native implementations where full SDK inheritance conflicts with Roost's DO conventions." Carry that wording into README "Philosophy."
