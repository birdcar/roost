# Implementation Spec: Roost AI Redesign - Phase 2 (Stateful Agents on Durable Objects)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation)
**Estimated Effort**: L

## Technical Approach

Phase 2 introduces `StatefulAgent` — an Agent that runs inside a Durable Object. This is the hinge of the CF Agents SDK integration. Every stateful primitive (Sessions, Schedule, Workflows later, Sub-agents later, HITL later) hangs off this DO-backed class.

The design wraps the CF Agents SDK's own `Agent` class (re-exported from `agents`) with a Roost-shaped façade so users extend `StatefulAgent` from `@roostjs/ai` and get Roost's contracts + DI + testing infrastructure, while the underlying runtime is the official CF SDK. This is critical: we don't reimplement the DO lifecycle; we consume it.

Sessions API wraps the CF SDK's Sessions primitive — tree-structured message history with compaction and FTS. `RemembersConversations` becomes a mixin that makes `StatefulAgent` route `messages()` through Sessions rather than in-memory. Schedule wraps `this.schedule(when, methodName, args)` from the CF SDK. `getCurrentAgent()` exposes the running agent to tool handlers via AsyncLocalStorage. Readonly connections expose a read-only view of state for observer clients.

Testing is the tricky part: `StatefulAgent.fake()` needs to bypass DO entirely and fall back to in-memory. We solve this with a `TestStatefulAgentHarness` that stubs the DO runtime via `@cloudflare/workers-shared`'s DO test utilities (or miniflare's DO test stubs). Unit tests use the harness; integration tests use real miniflare.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/stateful/agent.test.ts`

**Playground**: Test suite + a test harness exposing a `MockDurableObjectState` fixture. Most changes are to state transitions — a fast test runner is the tightest loop. Miniflare integration suite runs less often.

**Why this approach**: DO interaction logic lives in the agent class; the DO runtime is provided by CF SDK. Unit tests against the harness cover 95% of surface; miniflare tests validate the real DO contract.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/stateful/agent.ts` | `StatefulAgent` — extends CF SDK `Agent`, adds Roost contracts |
| `packages/ai/src/stateful/sessions.ts` | `Sessions` wrapper over CF SDK Sessions API |
| `packages/ai/src/stateful/remembers-conversations.ts` | `RemembersConversations` mixin providing `forUser(user)`, `continue(id)`, auto-persist |
| `packages/ai/src/stateful/schedule.ts` | `schedule(when, method, args)`, `scheduled` decorator |
| `packages/ai/src/stateful/readonly.ts` | `createReadonlyConnection(agent)` for observer clients |
| `packages/ai/src/stateful/context.ts` | `getCurrentAgent()` using AsyncLocalStorage |
| `packages/ai/src/stateful/index.ts` | Subpath export |
| `packages/ai/src/decorators.ts` | Add `@Stateful()`, `@Scheduled(cron)` |
| `packages/ai/src/testing/stateful-harness.ts` | `TestStatefulAgentHarness` — stubs DO state for unit tests |
| `packages/ai/__tests__/stateful/agent.test.ts` | Unit tests using harness |
| `packages/ai/__tests__/stateful/sessions.test.ts` | Sessions CRUD, compaction, FTS queries |
| `packages/ai/__tests__/stateful/remembers-conversations.test.ts` | Auto-persist user+assistant messages, continue() thread |
| `packages/ai/__tests__/stateful/schedule.test.ts` | Cron + one-shot schedule, cancellation, dedup |
| `packages/ai/__tests__/stateful/readonly.test.ts` | Read-only view cannot mutate; subscribes to state updates |
| `packages/ai/__tests__/integration/stateful-agent.miniflare.test.ts` | Integration: real DO persistence across eviction |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/agent.ts` | Move shared logic (middleware, tools) into helpers reusable by `StatefulAgent` |
| `packages/ai/src/types.ts` | Add `ConversationId`, `SessionNode`, `SessionBranch` types |
| `packages/ai/src/provider.ts` | `AiServiceProvider` registers DO namespace binding for `StatefulAgent`s |
| `packages/ai/package.json` | Add `agents` CF SDK as dependency (exact version pin); add `./stateful` subpath export |

## Implementation Details

### 1. StatefulAgent Base Class

**Pattern to follow**: `packages/broadcast/src/channel-do.ts` for Roost's DO wrapping convention; CF Agents SDK's `Agent` class for the lifecycle.

**Overview**: Extends CF SDK's `Agent` (which extends `DurableObject`). Adds Roost contracts (Conversational, HasTools, etc.) and routes prompts through the same middleware pipeline as base `Agent`.

```typescript
// packages/ai/src/stateful/agent.ts
import { Agent as CfAgent } from 'agents';
import { runPipeline } from '../middleware.js';
import { AgentPrompt } from '../prompt.js';

export abstract class StatefulAgent<Env = unknown> extends CfAgent<Env> {
  abstract instructions(): string;

  // Persistent state lives in this.state (DO storage wrapped by CF SDK)
  get sessions(): Sessions {
    return this._sessions ??= new Sessions(this.state);
  }

  async prompt(input: string, opts?: AgentPromptOptions): Promise<AgentResponse> {
    // Resolve provider, build prompt, run pipeline — same as base Agent
    // But messages() reads from sessions if RemembersConversations is applied
    const prompt = new AgentPrompt(input, opts);
    return runPipeline(this.middleware?.() ?? [], prompt, (p) => this.executeCore(p));
  }

  schedule(when: string | Date, method: keyof this, args?: unknown[]): Promise<void> {
    return super.schedule(when, method as string, args ?? []);
  }

  // Durable Object entrypoints
  async onRequest(request: Request): Promise<Response> { /* HTTP routing */ }
  async onConnect(connection: Connection): Promise<void> { /* WebSocket; fleshed in P3 */ }
  async onMessage(connection: Connection, message: WSMessage): Promise<void> { /* P3 */ }
}
```

**Key decisions**:
- Extend CF SDK `Agent` directly — zero reimplementation of DO lifecycle.
- `this.state` (from CF SDK) is the single source of truth; Sessions/RemembersConversations are thin wrappers.
- `prompt()` signature identical to base `Agent` so migration from non-stateful to stateful is the single-word change `extends Agent` → `extends StatefulAgent`.

**Implementation steps**:
1. Add `agents` package to deps (pin to SDK version).
2. Write `StatefulAgent` wrapping CF `Agent`.
3. Factor prompt execution into `executeCore(prompt)` shared with base Agent.
4. Wire events dispatch through `state` so they cross DO boundary cleanly.

**Feedback loop**:
- Playground: harness test in `stateful/agent.test.ts` with a mock `DurableObjectState`.
- Experiment: call `prompt()` → assert message history persisted; evict DO (clear in-memory, reload from state) → assert history still available.
- Check: `bun test packages/ai/__tests__/stateful/agent.test.ts`

### 2. Sessions API

**Pattern to follow**: CF SDK Sessions; internal patterns from `packages/broadcast` for DO storage.

**Overview**: Tree-structured message store with compaction + FTS. Wraps CF SDK's Sessions API; API surface aligns with Laravel's conversations.

```typescript
// packages/ai/src/stateful/sessions.ts
export interface SessionNode {
  id: string;
  parentId: string | null;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export class Sessions {
  constructor(private state: DurableObjectState) {}

  async create(opts?: { userId?: string }): Promise<string> { /* creates conversation, returns id */ }
  async append(convId: string, node: Omit<SessionNode, 'id' | 'createdAt'>): Promise<SessionNode> { /* ... */ }
  async branch(convId: string, fromNodeId: string): Promise<string> { /* fork conversation at node */ }
  async list(userId: string): Promise<ConversationSummary[]> { /* FTS-indexable */ }
  async history(convId: string, fromNodeId?: string): Promise<SessionNode[]> { /* linear history for LLM */ }
  async compact(convId: string, strategy: 'summarize' | 'drop-oldest' | 'llm'): Promise<void> { /* ... */ }
  async search(query: string, opts?: { userId?: string }): Promise<SessionNode[]> { /* FTS */ }
  async delete(convId: string): Promise<void> { /* ... */ }
}
```

**Key decisions**:
- Tree structure via `parentId` — branching is O(1), no copies.
- FTS uses CF SDK's built-in search if available; else we index content via a secondary storage key.
- Compaction strategies: `summarize` calls provider to summarize old messages; `drop-oldest` by count or token budget; `llm` is a user-supplied closure.

**Implementation steps**:
1. Define types.
2. Implement `create`, `append`, `history` (linear path via `parentId` walk).
3. Implement `branch` (new node with same parent).
4. Implement `list`/`search` using DO storage list() with prefixed keys.
5. Implement `compact` with all three strategies.
6. Dispatch `ConversationCompacted` event.

**Feedback loop**:
- Playground: `sessions.test.ts` with `MockDurableObjectStorage`.
- Experiment: append 100 messages, compact with each strategy, assert token budget + retention.
- Check: `bun test packages/ai/__tests__/stateful/sessions.test.ts`

### 3. RemembersConversations Mixin

**Pattern to follow**: Laravel's `RemembersConversations` trait semantics.

**Overview**: Makes a `StatefulAgent` auto-persist prompts/responses to Sessions. Adds `forUser()` and `continue(id)` builder methods.

```typescript
// packages/ai/src/stateful/remembers-conversations.ts
export function RemembersConversations<T extends new (...args: any[]) => StatefulAgent>(Base: T) {
  return class extends Base implements Conversational {
    private _userId?: string;
    private _conversationId?: string;

    forUser(user: { id: string }): this {
      this._userId = user.id;
      return this;
    }

    continue(convId: string, opts: { as?: { id: string } } = {}): this {
      this._conversationId = convId;
      if (opts.as) this._userId = opts.as.id;
      return this;
    }

    async messages(): Promise<Iterable<AgentMessage>> {
      if (!this._conversationId) return [];
      return await this.sessions.history(this._conversationId);
    }

    async prompt(input: string, opts?: AgentPromptOptions): Promise<AgentResponse> {
      if (!this._conversationId && this._userId) {
        this._conversationId = await this.sessions.create({ userId: this._userId });
      }
      const result = await super.prompt(input, opts);
      if (this._conversationId) {
        await this.sessions.append(this._conversationId, { parentId: null, role: 'user', content: input });
        await this.sessions.append(this._conversationId, { parentId: null, role: 'assistant', content: result.text });
      }
      return { ...result, conversationId: this._conversationId };
    }
  };
}
```

**Key decisions**:
- Ship as higher-order class (mixin function) rather than decorator so it composes with other mixins.
- `parentId` filled in during append by walking the existing tip.

**Implementation steps**:
1. Implement mixin.
2. Wire `conversationId` onto `AgentResponse`.
3. Dispatch `ConversationStarted` and `ConversationContinued` events.

**Feedback loop**: `bun test packages/ai/__tests__/stateful/remembers-conversations.test.ts`

### 4. Schedule

**Pattern to follow**: CF Agents SDK `this.schedule()`.

**Overview**: Wraps CF SDK scheduling with typed method names and args.

```typescript
// in StatefulAgent
schedule<K extends keyof this>(
  when: string | Date | number,  // cron string, Date, or delay seconds
  method: K,
  args: this[K] extends (...a: infer A) => any ? A : never,
): Promise<string /* scheduleId */>;

cancelSchedule(scheduleId: string): Promise<void>;
```

Also a `@Scheduled(cron)` method decorator registering auto-scheduling at agent init:

```typescript
class DailyDigest extends StatefulAgent {
  @Scheduled('0 9 * * *')  // 9am daily
  async sendDigest() { ... }
}
```

**Implementation steps**:
1. Expose CF SDK schedule via typed wrapper.
2. Add `@Scheduled` decorator storing cron expressions in metadata.
3. On DO `init`, register all `@Scheduled` methods.
4. Test via harness with mock clock.

**Feedback loop**: `bun test packages/ai/__tests__/stateful/schedule.test.ts`

### 5. Readonly Connections

**Overview**: Expose read-only state view for observer clients (e.g., admin dashboards watching an agent's progress).

```typescript
// packages/ai/src/stateful/readonly.ts
export function createReadonlyConnection(agent: StatefulAgent): ReadonlyConnection {
  return {
    async state(): Promise<Record<string, unknown>> { /* read DO state, strip writable surface */ },
    subscribe(key: string, fn: (val: unknown) => void): () => void { /* WS subscribe to state changes */ },
  };
}
```

**Implementation steps**:
1. Implement state read wrapped in `Object.freeze`.
2. Subscribe via state-change events on the DO; P3 fleshes out WS delivery.

**Feedback loop**: `bun test packages/ai/__tests__/stateful/readonly.test.ts`

### 6. getCurrentAgent() + AsyncLocalStorage

**Overview**: Tool handlers and middleware need to access the running agent. AsyncLocalStorage provides context without explicit threading.

```typescript
// packages/ai/src/stateful/context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
const als = new AsyncLocalStorage<StatefulAgent>();

export function runInAgentContext<T>(agent: StatefulAgent, fn: () => Promise<T>): Promise<T> {
  return als.run(agent, fn);
}

export function getCurrentAgent(): StatefulAgent | undefined {
  return als.getStore();
}
```

Wire it in `StatefulAgent.prompt()` and `onRequest()` so tool handlers can call `getCurrentAgent()`.

**Implementation steps**: Set store on prompt entry; document tool handler usage.

**Feedback loop**: `bun test packages/ai/__tests__/stateful/context.test.ts`

### 7. @Stateful() + AiServiceProvider Wiring

**Overview**: `@Stateful()` decorator marks an agent as requiring a DO binding. `AiServiceProvider` validates the DO namespace is configured.

```typescript
@Stateful({ binding: 'SUPPORT_AGENT' })
@Model('@cf/meta/llama-3.1-8b-instruct')
class SupportAgent extends StatefulAgent { /* ... */ }
```

Add `scriptName`/`className` auto-registration for wrangler config generation (future CLI work).

**Implementation steps**: Metadata only in this phase; CLI integration later.

### 8. Test Harness

**Overview**: `TestStatefulAgentHarness.for(AgentClass).withState(initialState).build()` returns a testable instance bypassing DO runtime.

**Pattern to follow**: `packages/testing/src/` conventions.

```typescript
export class TestStatefulAgentHarness<A extends StatefulAgent> {
  static for<A extends StatefulAgent>(AgentClass: new (...args: any[]) => A): TestStatefulAgentHarness<A> { /* ... */ }
  withState(state: Record<string, unknown>): this { /* ... */ }
  withSessions(sessions: SessionNode[]): this { /* ... */ }
  withMockClock(now: Date | number): this { /* ... */ }
  build(): A { /* returns instance with mocked state, sessions, clock */ }
}
```

**Implementation steps**:
1. Implement mock `DurableObjectState` with `storage`, `id`, `waitUntil` stubs.
2. Implement mock clock controllable from tests (`harness.advance(seconds)`).
3. Expose via `@roostjs/ai/testing`.

**Feedback loop**: Used by all other P2 tests.

## Data Model

### DO Storage Layout

```
conv:{convId}                → { userId, createdAt, rootNodeId }
conv:{convId}:node:{nodeId}  → SessionNode
conv:{convId}:children:{nodeId} → Set<nodeId>
conv:{convId}:search:{term}  → Set<nodeId>  (FTS index, populated on append)
sched:{scheduleId}           → { cron, method, args, nextFireAt }
user:{userId}:convs          → Set<convId>
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `stateful/agent.test.ts` | Lifecycle, middleware integration, DO state read/write |
| `stateful/sessions.test.ts` | CRUD, branching, compaction (all 3 strategies), search |
| `stateful/remembers-conversations.test.ts` | Auto-persist, forUser, continue, conversationId in response |
| `stateful/schedule.test.ts` | Cron parse, one-shot, cancel, `@Scheduled` registration |
| `stateful/readonly.test.ts` | Frozen state, subscribe, no-mutation guarantee |
| `stateful/context.test.ts` | getCurrentAgent inside prompt, middleware, tool handlers |

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/stateful-agent.miniflare.test.ts` | Real miniflare DO: persistence across eviction, schedule firing, Sessions compaction under load |

**Key scenarios**:
- Agent prompted 3 times → evict DO → prompt again → history contains all 4 messages
- Schedule 5 tasks → advance clock → each fires in order
- Compact conversation with 10k tokens → summary preserved; oldest messages dropped

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| DO binding missing from env | `AiServiceProvider.boot()` validates; throws early with named binding |
| Sessions storage quota exceeded | Automatic compaction triggered; if still over, throw `StorageQuotaExceededError` |
| Schedule method not found | Throw at registration time, not fire time |
| `continue(id)` with non-existent convId | Throw `ConversationNotFoundError` |
| Readonly connection mutation attempt | TypeScript prevents + runtime Object.freeze double-guard |
| AsyncLocalStorage not supported in runtime | Fallback to explicit threading in Workers if needed (check) |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Sessions | Tree grows unbounded | User never compacts | DO storage quota exceeded | Auto-compact when token count > threshold (default 50k) |
| Sessions | Branch creates orphan | Race between branch and delete | Dangling tree | Transaction-wrap tree mutations using CF SDK's `blockConcurrencyWhile` |
| Schedule | Method deleted after schedule created | Class evolves | Schedule fires → method missing → error | Emit `ScheduledMethodMissing` event; drop schedule |
| RemembersConversations | forUser + continue both called | Caller confusion | Second wins; first user's convId overwritten | Document; optionally throw on double-set |
| StatefulAgent | DO evicted mid-prompt | Platform eviction | Response lost to caller | CF SDK handles via `keepAlive()`; we re-dispatch if needed |
| Readonly connection | Subscriber count unbounded | Many observers | WS memory pressure | Limit subscribers per agent (configurable, default 100) |
| Compact (summarize) | Provider fails | AI provider down | Old messages can't be compacted | Retry with exponential backoff; fallback to `drop-oldest` |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/stateful/
bun test packages/ai/__tests__/integration/stateful-agent.miniflare.test.ts
```

## Rollout Considerations

- **DO migration path**: Document how existing in-memory `Agent` consumers migrate to `StatefulAgent`.
- **wrangler config**: Document the DO namespace binding requirement + `new_sqlite_classes` migration entry.
- **Rollback**: Non-stateful `Agent` still works; `StatefulAgent` is opt-in.

## Open Items

- [ ] Confirm CF SDK's Sessions API surface matches our wrapper; if not, adapt names to SDK terminology.
- [ ] Decide default compaction threshold (tokens) — start at 50k.
