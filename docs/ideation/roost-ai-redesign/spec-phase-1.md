# Implementation Spec: Roost AI Redesign - Phase 1 (Foundation Rewrite)

**Contract**: ./contract.md
**Estimated Effort**: XL

## Technical Approach

Rebuild the core Agent surface from scratch to match Laravel 13's AI SDK ergonomics. The v0.2 `Agent` class is a single monolithic class; the v0.3 design uses a thin base class + composable contracts (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions`) implemented as optional interfaces the Agent checks at runtime — matching Laravel's `implements` pattern in TypeScript.

Providers split into three tiers: (1) `WorkersAIProvider` (default, wraps the CF AI binding), (2) `GatewayAIProvider` (AI Gateway unified endpoint for external providers), (3) Native SDK provider adapters (`AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`) for features Gateway can't fully expose — extended thinking, reasoning tokens, provider-specific tool schemas. All three implement the same `AIProvider` interface. Failover is implemented as a `FailoverProvider` decorator that wraps an ordered list.

The middleware pipeline is modelled on Laravel's HTTP middleware pipeline — each middleware receives an `AgentPrompt` and a `Closure` to pass to the next, with a `then()` hook on the response. The decorator system expands to include `@UseCheapestModel` and `@UseSmartestModel`, resolved at runtime by querying the provider's capability table. All testing primitives land here: `Agent.fake()`, `preventStrayPrompts()`, `assertPrompted/assertQueued/assertNotPrompted/assertNeverPrompted`, with structured-output auto-fake. Events dispatch infrastructure wires into `@roostjs/events` so every public operation emits a typed event. Subpath exports scaffold the modular package shape: `@roostjs/ai`, `@roostjs/ai/rag`, `@roostjs/ai/media`, `@roostjs/ai/mcp`, `@roostjs/ai/testing`, `@roostjs/ai/client`.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/src/agent.test.ts`

**Playground**: Test suite — create `agent.test.ts` before writing each interface contract, add one smoke test per contract, then flesh out implementation.

**Why this approach**: Foundation is pure logic (providers, decorators, middleware, fakes). Unit tests are the tightest loop. No DO/DB/streaming yet — those come in Phase 2/3.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/contracts.ts` | `Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions` type predicates + interfaces |
| `packages/ai/src/prompt.ts` | `AgentPrompt` value object passed through middleware pipeline |
| `packages/ai/src/middleware.ts` | `AgentMiddleware` interface + pipeline runner with `then()` hook |
| `packages/ai/src/anonymous.ts` | `agent()` factory (full-feature anonymous agent, replaces current stub) |
| `packages/ai/src/responses/agent-response.ts` | `AgentResponse`, `StructuredAgentResponse` (array-like index access) |
| `packages/ai/src/responses/streamed-response.ts` | `StreamableAgentResponse` with `.then()` hook (used in P3 but interface shipped now) |
| `packages/ai/src/providers/workers-ai.ts` | Renamed from `cloudflare.ts` for clarity — wraps `AIClient` |
| `packages/ai/src/providers/anthropic.ts` | Native Anthropic SDK adapter |
| `packages/ai/src/providers/openai.ts` | Native OpenAI SDK adapter |
| `packages/ai/src/providers/gemini.ts` | Native Gemini SDK adapter |
| `packages/ai/src/providers/failover.ts` | `FailoverProvider` — ordered-list wrapper with per-provider retry |
| `packages/ai/src/providers/registry.ts` | Provider registry resolving `Lab`-like enum to instances |
| `packages/ai/src/enums.ts` | `Lab` enum (`WorkersAI`, `Anthropic`, `OpenAI`, `Gemini`, `Gateway`) |
| `packages/ai/src/events.ts` | `PromptingAgent`, `AgentPrompted`, `InvokingTool`, `ToolInvoked` events (more added in later phases) |
| `packages/ai/src/testing/index.ts` | Testing subpath — re-exports `AgentFake`, `preventStrayPrompts` helper |
| `packages/ai/src/testing/fakes.ts` | `AgentFake`, structured-output auto-fake (uses schema to generate shape) |
| `packages/ai/src/testing/assertions.ts` | `assertPrompted`, `assertNotPrompted`, `assertQueued`, `assertNothingPrompted` helpers |
| `packages/ai/src/capability-table.ts` | Model-capability registry used by `@UseCheapestModel` / `@UseSmartestModel` to resolve concrete model per provider |
| `packages/ai/src/index.ts` | Rewritten root exports |
| `packages/ai/src/testing.ts` | Subpath entrypoint re-exporting testing/* |
| `packages/ai/package.json` | Rewritten with modular `exports` field |
| `packages/ai/__tests__/agent.foundation.test.ts` | Unit tests for new Agent base class |
| `packages/ai/__tests__/middleware.test.ts` | Middleware pipeline tests |
| `packages/ai/__tests__/providers/failover.test.ts` | Failover behavior tests |
| `packages/ai/__tests__/providers/anthropic.test.ts` | Native Anthropic adapter tests (mocked HTTP) |
| `packages/ai/__tests__/providers/openai.test.ts` | Native OpenAI adapter tests (mocked HTTP) |
| `packages/ai/__tests__/providers/gemini.test.ts` | Native Gemini adapter tests (mocked HTTP) |
| `packages/ai/__tests__/testing-fakes.test.ts` | Verify `fake()`, `preventStrayPrompts`, structured-output auto-fake |
| `packages/ai/__tests__/decorators.test.ts` | All decorators including `@UseCheapestModel`, `@UseSmartestModel` |
| `packages/ai/__tests__/anonymous.test.ts` | Anonymous `agent()` full-feature tests |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/agent.ts` | Rewritten to use contracts, middleware pipeline, new events, failover support. Structured-output interface now actually plumbed through (was a stub in v0.2). |
| `packages/ai/src/decorators.ts` | Add `@UseCheapestModel`, `@UseSmartestModel`; update `@Provider` to accept `Lab | Lab[]` for failover |
| `packages/ai/src/tool.ts` | `Tool.name()` method (optional, defaults to class name) added for Laravel-style naming; `ToolRequest.get<T>` behavior preserved |
| `packages/ai/src/provider.ts` | `AiServiceProvider` re-wired: registers all three provider tiers, wires failover if config has `ai.providers` array |
| `packages/ai/src/providers/interface.ts` | `AIProvider` gains optional `capabilities()`, `embed()`, `rerank()`, `image()`, `audio()`, `transcribe()`, `files`, `stores` methods (stubs; implemented per-phase) |
| `packages/ai/src/providers/gateway.ts` | Extended to proxy to OpenAI/Anthropic/Gemini via AI Gateway's unified interface |
| `packages/ai/src/types.ts` | Add `ProviderOptions`, `AgentPromptOptions`, extended `AgentConfig` with `providers: Lab[]` |

### Deleted Files

| File Path | Reason |
| --- | --- |
| `packages/ai/src/providers/cloudflare.ts` | Renamed to `workers-ai.ts` for clarity |
| `packages/ai/dist/**` | Legacy build output — regenerated after rewrite |

## Implementation Details

### 1. Provider Interface + Three-Tier Hierarchy

**Pattern to follow**: `packages/ai/src/providers/interface.ts` (extend it) and `packages/queue/src/types.ts` (for capability table pattern)

**Overview**: `AIProvider` is the single interface all provider backends implement. `chat`, `stream`, `embed`, `rerank`, `image`, `audio`, `transcribe` are all optional — providers declare what they support via `capabilities()`.

```typescript
// packages/ai/src/providers/interface.ts
export type ProviderCapability =
  | 'chat' | 'stream' | 'embed' | 'rerank'
  | 'image' | 'audio' | 'transcribe'
  | 'files' | 'stores' | 'tools' | 'structured-output' | 'thinking';

export interface ProviderCapabilities {
  readonly supported: ReadonlySet<ProviderCapability>;
  readonly models: ReadonlyMap<string, ProviderCapability[]>;
  readonly cheapestChat?: string;
  readonly smartestChat?: string;
}

export interface AIProvider {
  readonly name: string;
  capabilities(): ProviderCapabilities;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(request: ProviderRequest): AsyncIterable<StreamEvent>;
  embed?(request: EmbedRequest): Promise<EmbedResponse>;
  // ... other optional methods, each defined in its own phase
}
```

**Key decisions**:
- Optional methods keep the interface one-shape; callers check `provider.capabilities().supported.has('embed')` before calling.
- `capabilities()` is pure and cached — called frequently for `@UseCheapestModel`.
- Native providers implement their SDK calls directly; Gateway provider proxies via `fetch` to CF Gateway; WorkersAI provider uses the `AIClient` binding.

**Implementation steps**:
1. Define `AIProvider`, `ProviderCapability`, `ProviderCapabilities` types in `interface.ts`.
2. Implement `WorkersAIProvider` (rename from `CloudflareAIProvider`, extend for `embed`).
3. Implement `GatewayAIProvider` with Gateway unified routing — path format `/v1/{account}/{gateway}/{provider}/{endpoint}`.
4. Implement `AnthropicProvider` using `fetch` directly against `api.anthropic.com` (no `@anthropic-ai/sdk` dep — we want zero-runtime-dep providers for Workers bundle size). Support `anthropic-beta` headers, thinking budgets via `providerOptions`.
5. Implement `OpenAIProvider` similarly against `api.openai.com/v1`. Support reasoning params.
6. Implement `GeminiProvider` against `generativelanguage.googleapis.com`.
7. Implement `FailoverProvider({ providers: AIProvider[] })` — calls each in order, catches 5xx/429, returns first success. Emits a `ProviderFailoverTriggered` event per fallback.
8. Implement `providerRegistry` (container-resolved) mapping `Lab` enum to instances.

**Feedback loop**:
- **Playground**: `packages/ai/__tests__/providers/` — one test file per provider, start with a smoke test that mocks `fetch` and asserts the correct URL/headers/body.
- **Experiment**: Run with `capabilities: { chat: true }` and `{ chat: false }` to assert the runtime capability check. Mock 200/429/500 responses for failover.
- **Check command**: `bun test packages/ai/__tests__/providers/`

### 2. Agent Base Class + Contract Mixins

**Pattern to follow**: `packages/ai/src/agent.ts` (current) and Laravel's trait system (compose via `implements` in TS)

**Overview**: `Agent` is a thin abstract base that routes prompts through the middleware pipeline, tool loop, and provider. Optional capabilities are detected at runtime via type guards — if `'messages' in instance && typeof instance.messages === 'function'` the agent is conversational.

```typescript
// packages/ai/src/contracts.ts
export interface Conversational {
  messages(): Iterable<AgentMessage> | Promise<Iterable<AgentMessage>>;
}

export interface HasTools {
  tools(): Tool[];
}

export interface HasStructuredOutput<T = unknown> {
  schema(s: typeof schema): Record<string, SchemaBuilder>;
}

export interface HasMiddleware {
  middleware(): AgentMiddleware[];
}

export interface HasProviderOptions {
  providerOptions(provider: Lab | string): Record<string, unknown>;
}

export function isConversational(x: unknown): x is Conversational {
  return !!x && typeof x === 'object' && typeof (x as any).messages === 'function';
}
// ... similar guards for each contract
```

**Key decisions**:
- No abstract `messages()` on `Agent` — opt-in via `Conversational` interface so non-conversational agents don't carry dead code.
- `AgentResponse` becomes an object with `.text`, `.messages`, `.toolCalls`, `.usage`, `.conversationId` (undefined unless `RemembersConversations`), `.stream: ReadableStream | null`.
- `StructuredAgentResponse<T>` extends `AgentResponse` with `Proxy`-based index access so `response['score']` works.

**Implementation steps**:
1. Write `Agent` abstract class in `agent.ts` — `prompt()`, `stream()` (delegates to P3), `queue()` (delegates to P4).
2. Inside `prompt()`: build `AgentPrompt`, run middleware pipeline, call provider with tool loop (up to `maxSteps`).
3. Implement tool loop: detect tool calls, invoke `tool.handle(request)`, push result into message history, loop until no tool calls or `maxSteps` exhausted.
4. If `HasStructuredOutput`, wrap response into `StructuredAgentResponse` with schema validation + Proxy accessor.
5. If `HasMiddleware`, pass pipeline through in step 2.
6. If `HasProviderOptions`, merge `providerOptions(currentProvider)` into request.
7. Dispatch `PromptingAgent` before provider call, `AgentPrompted` after (via `@roostjs/events`).

**Feedback loop**:
- **Playground**: `packages/ai/__tests__/agent.foundation.test.ts` — describe blocks per contract.
- **Experiment**: Build an agent implementing 0, 1, 2, 3, and all 5 contracts; verify each path runs through the right code.
- **Check command**: `bun test packages/ai/__tests__/agent.foundation.test.ts`

### 3. Middleware Pipeline

**Pattern to follow**: None in current codebase — inspired by Laravel's HTTP middleware; similar in spirit to `packages/core/src/middleware.ts` (check `app.useMiddleware` pattern).

**Overview**: Middleware receives `AgentPrompt` and a `next: Closure`. The pipeline is built at prompt-time by composing middleware in reverse, producing a single function.

```typescript
// packages/ai/src/middleware.ts
export type NextFn = (prompt: AgentPrompt) => Promise<AgentResponse>;

export interface AgentMiddleware {
  handle(prompt: AgentPrompt, next: NextFn): Promise<AgentResponse>;
}

export async function runPipeline(
  middleware: AgentMiddleware[],
  prompt: AgentPrompt,
  terminal: NextFn,
): Promise<AgentResponse> {
  const pipeline = middleware.reduceRight<NextFn>(
    (next, mw) => (p) => mw.handle(p, next),
    terminal,
  );
  const result = await pipeline(prompt);
  // Invoke any `.then()` hooks registered on the response
  for (const hook of (result as any).__thenHooks ?? []) await hook(result);
  return result;
}
```

**Key decisions**:
- `.then(cb)` on the response is implemented by pushing to an internal `__thenHooks` array; runs after the pipeline resolves. This matches Laravel's `then()` behavior.
- Middleware can short-circuit by not calling `next(prompt)` and returning a synthetic response directly.

**Implementation steps**:
1. Define `AgentMiddleware`, `NextFn`, `runPipeline`.
2. In `Agent.prompt()`, resolve middleware from `HasMiddleware` if present, prepend built-in telemetry middleware, run pipeline.
3. Attach `then()` method to response that queues a hook.

**Feedback loop**: `bun test packages/ai/__tests__/middleware.test.ts`

### 4. Decorators (All of Them)

**Pattern to follow**: `packages/queue/src/decorators.ts`

**Overview**: Extend current decorator set. Add `@UseCheapestModel`, `@UseSmartestModel` that resolve at runtime against the provider's capability table.

```typescript
// packages/ai/src/decorators.ts (extended)
export function UseCheapestModel(providerName?: Lab | string) {
  return (target: Function) => {
    ensureConfig(target).modelResolver = { strategy: 'cheapest', provider: providerName };
  };
}

export function UseSmartestModel(providerName?: Lab | string) {
  return (target: Function) => {
    ensureConfig(target).modelResolver = { strategy: 'smartest', provider: providerName };
  };
}
```

Runtime resolution: `const model = config.model ?? resolveModel(provider, config.modelResolver) ?? defaultModel`.

**Implementation steps**:
1. Add `modelResolver` to `AgentConfig` type.
2. Implement `resolveModel(provider, resolver)` using `provider.capabilities()`.
3. Update `@Provider` to accept `Lab | Lab[]`; array maps to failover.

**Feedback loop**: `bun test packages/ai/__tests__/decorators.test.ts`

### 5. Anonymous Agent (Full-Feature)

**Pattern to follow**: `packages/ai/src/agent.ts:agent()` (current stub)

**Overview**: Current `agent()` only supports `instructions + tools + provider`. New version accepts `instructions, messages, tools, schema, middleware, providerOptions, provider` and returns an object with `prompt`, `stream`, `queue`.

```typescript
export function agent(options: {
  instructions: string | Stringable;
  messages?: Iterable<AgentMessage>;
  tools?: Tool[];
  schema?: (s: typeof schema) => Record<string, SchemaBuilder>;
  middleware?: AgentMiddleware[];
  providerOptions?: (p: Lab | string) => Record<string, unknown>;
  provider?: AIProvider | Lab | Lab[];
}): AnonymousAgent { ... }
```

**Implementation steps**: Build anonymous class implementing whichever contracts are requested based on provided options.

**Feedback loop**: `bun test packages/ai/__tests__/anonymous.test.ts`

### 6. Testing Fakes + Assertions

**Pattern to follow**: `packages/broadcast/src/fake.ts`, `packages/events/src/fake.ts`

**Overview**: `Agent.fake()` accepts a static array, a closure, or nothing (auto-generated). `preventStrayPrompts()` throws if any prompt arrives without a matching fake. Structured-output agents auto-generate fake data from their `schema()`.

```typescript
// packages/ai/src/testing/fakes.ts
export class AgentFake {
  constructor(
    private responses: string[] | ((prompt: AgentPrompt) => string | StructuredAgentResponse),
    private preventStray = false,
  ) {}

  preventStrayPrompts(): this {
    this.preventStray = true;
    return this;
  }

  nextResponse(prompt: AgentPrompt, schema?: Record<string, SchemaBuilder>): AgentResponse {
    if (typeof this.responses === 'function') return this.asResponse(this.responses(prompt));
    // ... index-based, with stray-prompt guard and auto-fake for structured
  }
}
```

**Key decisions**:
- Fakes stored in `WeakMap<typeof Agent, AgentFake>` (matches current pattern).
- Structured-output auto-fake uses the schema's default values or type-appropriate sentinels (strings → '', numbers → 0, enums → first value).
- `assertPrompted/assertQueued/assertNotPrompted/assertNeverPrompted` live alongside.

**Implementation steps**:
1. Implement `AgentFake` with modes (static array, closure, auto).
2. Implement auto-fake generator walking schema tree.
3. Implement `preventStrayPrompts` guard.
4. Implement all four assertion methods on `Agent` class.
5. Expose testing helpers via `@roostjs/ai/testing` subpath.

**Feedback loop**: `bun test packages/ai/__tests__/testing-fakes.test.ts`

### 7. Events

**Pattern to follow**: `packages/events/src/event.ts`, `packages/events/src/dispatcher.ts`

**Overview**: Define foundation events; add more per-phase. Events extend `Event` from `@roostjs/events` so they're dispatchable, fakeable, and listener-registerable.

```typescript
// packages/ai/src/events.ts
export class PromptingAgent extends Event {
  constructor(public prompt: AgentPrompt, public agent: string) { super(); }
}
export class AgentPrompted extends Event {
  constructor(public prompt: AgentPrompt, public response: AgentResponse) { super(); }
}
export class InvokingTool extends Event { /* ... */ }
export class ToolInvoked extends Event { /* ... */ }
```

**Implementation steps**: Declare events, dispatch at the right points in `Agent.prompt()`.

### 8. Subpath Exports + Package.json

**Pattern to follow**: Packages using `exports` field with subpaths — check `packages/start/package.json`.

**Overview**: Rewrite `packages/ai/package.json` exports field:

```json
{
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts" },
    "./rag": { "types": "./src/rag/index.ts", "import": "./src/rag/index.ts" },
    "./media": { "types": "./src/media/index.ts", "import": "./src/media/index.ts" },
    "./mcp": { "types": "./src/mcp/index.ts", "import": "./src/mcp/index.ts" },
    "./testing": { "types": "./src/testing/index.ts", "import": "./src/testing/index.ts" },
    "./client": { "types": "./src/client/index.ts", "import": "./src/client/index.ts" }
  }
}
```

**Implementation steps**:
1. Update `package.json` exports.
2. Create stub `index.ts` in each subpath (phases fill them in).
3. Bump version to `0.3.0-alpha.1`.
4. Update `README.md` with new exports map.

## Data Model

No persistent state in Phase 1. Message history in `Agent` stored in-memory (moves to Sessions in P2).

## API Design

All API is TS types + classes; no HTTP endpoints in this phase.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `packages/ai/__tests__/agent.foundation.test.ts` | Agent base class routes through contracts, middleware, tool loop, events |
| `packages/ai/__tests__/middleware.test.ts` | Pipeline composition, short-circuit, `then()` hooks, error propagation |
| `packages/ai/__tests__/anonymous.test.ts` | Anonymous agent with each contract combo |
| `packages/ai/__tests__/decorators.test.ts` | Every decorator incl. `@UseCheapestModel`, `@UseSmartestModel`, `@Provider([...])` array |
| `packages/ai/__tests__/testing-fakes.test.ts` | Fake modes, preventStrayPrompts, structured auto-fake, all four assertions |
| `packages/ai/__tests__/providers/workers-ai.test.ts` | Chat + embed via AIClient mock; error paths |
| `packages/ai/__tests__/providers/gateway.test.ts` | Chat + proxy to external providers; session affinity headers; 5xx fallback |
| `packages/ai/__tests__/providers/anthropic.test.ts` | Request shape, thinking budget, tool use, error mapping |
| `packages/ai/__tests__/providers/openai.test.ts` | Reasoning params, tool schema conversion, error mapping |
| `packages/ai/__tests__/providers/gemini.test.ts` | Function calling, system instruction, error mapping |
| `packages/ai/__tests__/providers/failover.test.ts` | Sequential fallback, event emission, empty-list error, all-fail propagation |
| `packages/ai/__tests__/capability-table.test.ts` | `resolveModel` picks cheapest/smartest from each provider |

**Key test cases**:
- Agent without any contracts still works via pure `prompt()`
- Structured-output + middleware + tools all composed in one agent
- `@UseCheapestModel` with `@Provider([OpenAI, Anthropic])` picks cheapest of first provider's table
- Failover: first provider 429 → second provider 200 → returns second's response + emits 1 failover event
- `preventStrayPrompts()` throws when prompted with no fake defined
- Anonymous `agent()` with inline schema produces `StructuredAgentResponse`
- Provider options flow through to native Anthropic request body (e.g., `thinking.budget_tokens`)

### Integration Tests

None in this phase — integration surface lands in P2 (DO).

### Manual Testing

- [ ] Cold-import `@roostjs/ai` from a new app, write a smoke agent, run via `wrangler dev`.
- [ ] Verify `@roostjs/ai/testing` subpath resolves.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| No provider registered for agent | Throw `NoProviderRegisteredError` with clear hint to register `AiServiceProvider` or call `Agent.setProvider()` |
| All failover providers fail | Throw `AllProvidersFailedError` carrying array of underlying errors |
| Provider 429 | Short-circuit to next provider in failover, emit `ProviderRateLimited` event |
| Provider returns invalid tool call JSON | Parse leniently; if unparseable, log + skip the call, continue loop |
| Structured output doesn't match schema | Validate once, on mismatch: retry the prompt with schema context (one retry), then throw `StructuredOutputValidationError` |
| Middleware throws | Propagate; no automatic retry |
| `@UseCheapestModel` with provider having no capability table | Fall back to provider's default model |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| FailoverProvider | All providers fail | Every provider returns 5xx/429 | Caller gets `AllProvidersFailedError` | Surface all causes in the error |
| Tool loop | Infinite loop via repeated tool calls | Model repeatedly requests the same tool | Exceeds `maxSteps` → returns last response without final text | Honor `maxSteps`; emit `MaxStepsExhausted` event |
| Native provider | Auth header missing | Env var not set at boot | Provider throws on first call | Validate env at `AiServiceProvider.boot()` and log clear error |
| Native provider | Provider SDK changes response shape | Upstream API version bump | Parse error thrown | Pin API version in request headers; test with recorded fixtures |
| Middleware | `.then()` hook throws | User-supplied hook bug | Response already built; hook error would crash | Catch + log; don't re-throw unless fatal (configurable) |
| Anonymous agent | Schema closure mutates external state | User mischief | Unpredictable | Document: schema must be pure |
| Capability table | Model unknown to provider | Hardcoded list out of date | `@UseCheapestModel` picks stale model | Ship a seed table; allow user override via `AiServiceProvider` config |

## Validation Commands

```bash
# Type checking
bun run --filter @roostjs/ai typecheck

# Unit tests
bun test packages/ai/

# Build (verifies exports field)
bun run --filter @roostjs/ai build
```

## Rollout Considerations

- **Feature flag**: None; foundation must land atomically.
- **Version**: `0.3.0-alpha.1` — pre-release tag to let early adopters validate before stable v0.3.0 (ships with P9).
- **Monitoring**: None yet — events emitted but consumers register in downstream packages.
- **Rollback plan**: v0.2.0 is on npm; consumers pin until migration complete.

## Open Items

- [ ] Decide final names for native provider classes — `AnthropicProvider` vs `NativeAnthropicProvider`. Decision: drop "Native" prefix; `GatewayAIProvider` makes the distinction clear.
- [ ] Capability table source of truth: manual curation vs generated from a JSON manifest. Start manual; revisit before v0.3.0 stable.
