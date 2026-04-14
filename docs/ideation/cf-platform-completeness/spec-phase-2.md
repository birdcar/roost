# Phase 2 Spec: AI Gateway + Enhanced AI Provider

**Initiative**: CF Platform Completeness
**Phase**: 2 of 8
**Blocks**: Phase 3 (RAG Pipeline + AI Search)
**Blocked by**: Phase 1 (Production Foundations — needs `waitUntil`, observability, request context)
**Status**: Ready to implement

---

## Technical Approach

Four independent additions to two packages (`@roost/ai`, `@roost/cloudflare`):

1. **`GatewayAIProvider`** — A new `AIProvider` implementation that proxies `chat()` calls through the Cloudflare AI Gateway REST endpoint. Reads account/gateway config from `ai.gateway.accountId` and `ai.gateway.gatewayId`. Falls back transparently to `CloudflareAIProvider` when those config keys are absent. Registered automatically by `AiServiceProvider` when gateway config is present.

2. **Async inference** — `AIClient.run()` gains an optional `{ queueRequest: true }` in its `options` parameter. When set, Cloudflare Workers AI returns an async task ID instead of a response body. `AIClient.poll(taskId)` checks task status. `Agent.prompt()` gains a `queued?: true` option that activates this path and returns a discriminated-union response: `{ queued: true; taskId: string }` vs the existing `{ text: string; ... }`.

3. **Prefix caching / session affinity** — `CloudflareAIProvider.chat()` checks whether the request has prior conversation history and, if so, includes `x-session-affinity: true` in the underlying `fetch` call (via `AIClient`). `AIClient.run()` gains an optional `headers?: Record<string, string>` passthrough so providers can inject arbitrary headers.

4. **Auto-detect AI, Vectorize, DurableObjects, Hyperdrive** — `CloudflareServiceProvider.registerBinding()` gains four new duck-type guards and wraps matching bindings in the existing `AIClient`, `VectorStore`, `DurableObjectClient`, and `HyperdriveClient` wrappers that already exist in `packages/cloudflare/src/bindings/`.

All four items are independently shippable. Implement and commit each separately so that a partial failure does not block the others.

---

## Feedback Strategy

Inner loop: `bun test --filter ai` and `bun test --filter cloudflare` after each component.

Full gate before any commit: `bun run typecheck` must pass clean. The codebase uses strict TypeScript — no `any` escapes except where they already exist at CF binding call sites.

---

## File Changes

### New Files

| File | Purpose |
|---|---|
| `packages/ai/src/providers/gateway.ts` | `GatewayAIProvider` class |
| `packages/ai/src/providers/gateway.test.ts` | Tests for `GatewayAIProvider` |
| `packages/cloudflare/src/bindings/ai.test.ts` | Tests for `AIClient` async inference and header passthrough |
| `packages/cloudflare/src/provider.test.ts` | Tests for new duck-type detections |

### Modified Files

| File | Change |
|---|---|
| `packages/cloudflare/src/bindings/ai.ts` | Add `headers?` to options; add `poll(taskId)` method; accept `queueRequest` flag |
| `packages/cloudflare/src/provider.ts` | Add `isAi()`, `isVectorize()`, `isDurableObjectNamespace()`, `isHyperdrive()` guards and their branches in `registerBinding()` |
| `packages/ai/src/providers/cloudflare.ts` | Pass `headers` through `AIClient.run()` when session affinity is needed |
| `packages/ai/src/provider.ts` | Register `GatewayAIProvider` when gateway config is present; prefer it over `CloudflareAIProvider` in `boot()` |
| `packages/ai/src/types.ts` | Add `queued?: boolean` to `AgentConfig`; add `QueuedAgentResponse` discriminated union |
| `packages/ai/src/agent.ts` | Handle `queued` option in `prompt()`; return `QueuedAgentResponse` when queuing |
| `packages/ai/src/index.ts` | Export `GatewayAIProvider` and `QueuedAgentResponse` |

---

## Implementation Details

### Component 1: GatewayAIProvider

**File**: `packages/ai/src/providers/gateway.ts`

The gateway endpoint format is:
```
https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/{model}
```

The provider translates a `ProviderRequest` to the same JSON body that `CloudflareAIProvider` sends to `AIClient.run()` — `{ messages, max_tokens, temperature, tools }` — but sends it via `fetch` directly to the gateway URL instead of through the `Ai` binding.

Config interface:
```typescript
interface GatewayConfig {
  accountId: string;
  gatewayId: string;
}
```

Constructor signature:
```typescript
constructor(private config: GatewayConfig, private fallback: CloudflareAIProvider)
```

The fallback is always a `CloudflareAIProvider` so that `GatewayAIProvider` cannot be used without a direct-path safety net. The `AiServiceProvider` constructs both and passes the direct provider as fallback.

Gateway response shape mirrors Workers AI directly — parse `result.response` as text and `result.tool_calls` as tool calls. If the gateway returns a non-2xx status, log the error (using the Phase 1 structured logger if available, otherwise `console.error`) and delegate to `this.fallback.chat(request)`.

Latency overhead of ~10ms comes from the extra HTTP hop. No special mitigation needed; document this in a comment on the class.

`AiServiceProvider` registration logic (in `packages/ai/src/provider.ts`):

```typescript
boot(): void {
  const gatewayAccountId = this.app.config.get('ai.gateway.accountId');
  const gatewayGatewayId = this.app.config.get('ai.gateway.gatewayId');

  const directProvider = this.app.container.resolve(CloudflareAIProvider);

  const provider = gatewayAccountId && gatewayGatewayId
    ? new GatewayAIProvider({ accountId: gatewayAccountId, gatewayId: gatewayGatewayId }, directProvider)
    : directProvider;

  Agent.setProvider(provider);
}
```

### Component 2: Async Inference

**Files**: `packages/cloudflare/src/bindings/ai.ts`, `packages/ai/src/types.ts`, `packages/ai/src/agent.ts`

`AIClient` changes:

```typescript
interface AiRunOptions {
  headers?: Record<string, string>;
  queueRequest?: boolean;
}

async run<T = string>(
  model: string,
  inputs: Record<string, unknown>,
  options?: AiOptions & AiRunOptions
): Promise<T | { id: string }>
```

When `options?.queueRequest` is true, pass `{ queueRequest: true }` to the underlying `this.ai.run()` call. Cloudflare returns `{ id: string }` for queued requests instead of the result. The return type union is a pragmatic compromise — callers that do not set `queueRequest` never see `{ id }`.

`AIClient.poll(taskId: string)` — calls the Workers AI REST API at `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/tasks/{taskId}` to check task status. However, this requires the account ID and a CF API token, which the `Ai` binding does not expose. **Alternative approach**: expose `poll` as a method that accepts a fetch-compatible callable, letting callers bring their own HTTP client. This keeps `AIClient` binding-only and avoids storing credentials in it.

Simplest viable design:
```typescript
async poll<T = string>(taskId: string, fetcher: typeof fetch): Promise<{ status: 'running' } | { status: 'done'; result: T }>
```

Callers pass `fetch` (available in Workers scope). Document that callers must set `Authorization: Bearer <CF_API_TOKEN>` on their fetcher or wrap it.

`AgentConfig` addition:
```typescript
queued?: boolean;
```

`QueuedAgentResponse` discriminated union in `types.ts`:
```typescript
export type PromptResult =
  | { queued: false; text: string; messages: AgentMessage[]; toolCalls: ToolCall[]; usage?: { promptTokens: number; completionTokens: number } }
  | { queued: true; taskId: string };
```

`Agent.prompt()` return type becomes `Promise<PromptResult>`. When `options?.queued` is true, `prompt()` calls `provider.chat()` with `queueRequest: true` and returns the task ID immediately. The existing `AgentResponse` type is preserved as the non-queued branch of `PromptResult` to avoid breaking changes.

`AgentResponse` is unchanged. `PromptResult` is a superset. The `stream()` method continues to call `prompt()` and guards against the `queued: true` branch (throws `Error('Cannot stream a queued request')`).

### Component 3: Prefix Caching / Session Affinity

**Files**: `packages/cloudflare/src/bindings/ai.ts`, `packages/ai/src/providers/cloudflare.ts`

`AIClient.run()` already takes `AiOptions` as a third argument. The existing Workers AI binding does not forward arbitrary headers, so session affinity must be passed as a custom option that `CloudflareAIProvider` applies when constructing the request.

Since the `Ai` binding's `run()` does not accept arbitrary HTTP headers (it is a binding call, not a fetch), the `x-session-affinity` header can only be sent when requests go through `GatewayAIProvider` (which uses `fetch`). `CloudflareAIProvider` with the direct binding cannot send this header.

The correct implementation:

- `CloudflareAIProvider.chat()` detects conversation history (`request.messages.length > 2`, meaning at least a system + 1 prior exchange) and sets a flag.
- It does nothing with that flag when calling the binding directly — session affinity via header is only meaningful over HTTP.
- `GatewayAIProvider.chat()` checks the same condition and includes `'x-session-affinity': 'true'` in the `fetch` call headers when prior conversation history exists.

Add a private `hasConversationHistory(messages: AgentMessage[]): boolean` helper in `gateway.ts`:
```typescript
private hasConversationHistory(messages: AgentMessage[]): boolean {
  // More than system + first user message means we have history worth routing
  return messages.filter(m => m.role !== 'system').length > 1;
}
```

No changes to `AIClient.run()` are needed for this component — it is purely a header decision in `GatewayAIProvider.chat()`.

### Component 4: Auto-detect AI, Vectorize, DurableObjects, Hyperdrive

**File**: `packages/cloudflare/src/provider.ts`

New guards to add to `CloudflareServiceProvider`:

```typescript
private isAi(obj: object): boolean {
  // Has `run` but not `prepare` (D1) or `batch` (D1/Queue)
  return 'run' in obj && !('prepare' in obj) && !('batch' in obj);
}

private isVectorize(obj: object): boolean {
  return 'query' in obj && 'insert' in obj && 'getByIds' in obj && 'deleteByIds' in obj;
}

private isDurableObjectNamespace(obj: object): boolean {
  return 'idFromName' in obj && 'idFromString' in obj && 'newUniqueId' in obj && 'get' in obj;
}

private isHyperdrive(obj: object): boolean {
  return 'connectionString' in obj;
}
```

`Hyperdrive` detection is the most fragile because `connectionString` is a common property name. Add a second check: `'host' in obj && 'port' in obj && 'connectionString' in obj`. This is still duck typing but more discriminating.

`registerBinding()` extension — add these branches after the existing Queue check:

```typescript
} else if (this.isAi(binding)) {
  this.app.container.singleton(key as any, () => new AIClient(binding as Ai));
} else if (this.isVectorize(binding)) {
  this.app.container.singleton(key as any, () => new VectorStore(binding as VectorizeIndex));
} else if (this.isDurableObjectNamespace(binding)) {
  this.app.container.singleton(key as any, () => new DurableObjectClient(binding as DurableObjectNamespace));
} else if (this.isHyperdrive(binding)) {
  this.app.container.singleton(key as any, () => new HyperdriveClient(binding as Hyperdrive));
}
```

Order matters: the existing KV/R2/D1/Queue checks come first since their duck-typing is already established and tested. AI/Vectorize/DO/Hyperdrive are added last. If a future CF binding collides with these patterns, the stricter guard should be added at that point.

The `VectorStore`, `DurableObjectClient`, and `HyperdriveClient` imports are already present in `provider.ts` (lines 7-9 of the current file). Only `AIClient` needs to be confirmed present — it is already imported on line 6.

---

## Testing Requirements

### GatewayAIProvider tests (`packages/ai/src/providers/gateway.test.ts`)

- Sends request to correct gateway URL (assert fetch was called with `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/{model}`)
- Parses text response from `result.response`
- Falls back to direct provider on non-2xx gateway response
- Falls back to direct provider when gateway URL is unreachable (network error)
- Includes `x-session-affinity: true` header when messages include prior conversation turns
- Does NOT include `x-session-affinity` on first-turn requests (system + single user message only)
- `name` property equals `'cloudflare-ai-gateway'`

Use `vi.spyOn(globalThis, 'fetch')` or inject a mock `fetch` parameter to avoid real HTTP calls.

### AIClient async inference tests (`packages/cloudflare/src/bindings/ai.test.ts`)

- When `queueRequest: true`, passes the flag through to the underlying binding
- When `queueRequest: true`, returns `{ id: string }` shape
- `poll()` calls the correct task status URL
- `poll()` returns `{ status: 'running' }` when task is incomplete
- `poll()` returns `{ status: 'done'; result: T }` when task is complete

### Agent async inference tests (add to existing agent test file or a new `agent.queued.test.ts`)

- `prompt({ queued: true })` returns `{ queued: true; taskId: string }`
- `prompt()` (no option) returns `{ queued: false; text: string; ... }`
- `stream()` throws when called with `queued: true` option

### CloudflareServiceProvider binding detection tests (`packages/cloudflare/src/provider.test.ts`)

For each new binding type, test:
- A binding with the correct duck-type shape is detected and wrapped in the appropriate client class
- A binding missing a required property is NOT detected as that type
- The registered container value is the correct wrapper class instance

Confirm the existing KV/R2/D1/Queue tests still pass (no regression).

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Gateway config partially set (only `accountId` or only `gatewayId`) | Treat as missing config, use `CloudflareAIProvider` directly. Log a warning via Phase 1 logger or `console.warn`. |
| Gateway returns non-2xx | Log error, delegate to fallback `CloudflareAIProvider`. Never surface a raw gateway error to the caller. |
| Gateway fetch throws (network unreachable) | Catch, log, delegate to fallback. Same as non-2xx. |
| `poll()` called without a valid `fetcher` | TypeScript enforces `fetcher: typeof fetch` — no runtime guard needed. |
| Queued prompt attempted with `stream()` | Throw `Error('Cannot stream a queued request — use Agent.prompt({ queued: true }) and poll for results')`. |
| Two bindings match the same guard | First match wins. Order in `registerBinding()` is deterministic. Document the precedence in a comment. |
| `Ai` binding collides with another `run`-having object | The negative checks (`!('prepare' in obj) && !('batch' in obj)`) mitigate this. If a new CF binding has `run`, `prepare`, `batch` — it will be caught by D1's guard, which is correct. |

---

## Failure Modes

| Failure | Impact | Mitigation |
|---|---|---|
| AI Gateway is down | All AI requests fail if fallback is not implemented correctly | Fallback is mandatory, tested in `gateway.test.ts` |
| `x-session-affinity` header ignored by CF (API change) | No crash — requests just won't get GPU affinity. Silent degradation. | No mitigation needed; log at debug level if Phase 1 logger is present |
| Async task ID returned but polling API credentials not configured | `poll()` call will 401 | Document that callers must configure CF API token for async inference. `poll()` returns a typed error union rather than throwing when possible |
| DurableObjectNamespace duck-typing collides with future CF binding | Wrong wrapper class registered | Guard is conservative (4 required methods) — low probability, but flag this in a comment for future reviewers |
| `GatewayAIProvider` is set as default but gateway is slow | ~10ms added to every AI request | Acceptable tradeoff for caching/observability benefits. Document clearly. |
| `PromptResult` return type change breaks callers of `Agent.prompt()` | TypeScript compile error at call sites | Migration: callers must narrow on `result.queued` before accessing `result.text`. Affects all existing callers. Make the change non-breaking by keeping `AgentResponse` as a named alias for the non-queued branch. |

---

## Validation Commands

```bash
# Inner loop (per component)
bun test --filter ai
bun test --filter cloudflare

# Full gate before commit
bun run typecheck
bun test --filter ai
bun test --filter cloudflare
```

Run inner loop after each component. Run full gate before any commit.
