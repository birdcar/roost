# Implementation Spec: Roost AI Redesign - Phase 4 (Tools + Attachments + Queueing)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation)
**Estimated Effort**: M

## Technical Approach

Phase 4 rounds out the tool ecosystem: the generic `Tool` interface gains a canonical name resolver, ships three provider tools (`WebSearch`, `WebFetch`, `FileSearch`) that map to CF / provider-native implementations, and ships the `Attachments` API (`Files.Image`, `Files.Document` with `fromStorage / fromPath / fromUrl / fromId / fromUpload / fromString` constructors). The attachment surface is what lets users pass documents and images into prompts without re-uploading — a core Laravel ergonomic.

Queueing is bridged to `@roostjs/queue`: `agent.queue(input).then().catch()`, `agent.queueAfter(seconds, input)`, and queue decorators (`@Queue('ai-inference')`, `@MaxRetries(3)`, `@Backoff('exponential')`) on agent classes. Under the hood, a queued prompt serializes (provider name, model, messages, tools signature) and dispatches a `PromptAgentJob` via `@roostjs/queue`. The consumer re-materializes the agent, executes, and invokes `.then()` / `.catch()` callbacks that are preserved via a callback registry indexed by prompt ID.

Provider tools (`WebSearch`, `WebFetch`, `FileSearch`) differ from user-defined tools because they're executed by the provider, not our runtime. Our job is to emit the right markers in the outgoing request. `WebSearch` supports Anthropic/OpenAI/Gemini; `WebFetch` Anthropic/Gemini; `FileSearch` OpenAI/Gemini — matching Laravel's support matrix. Each gets a builder (`.max(n)`, `.allow([domains])`, `.location(city, region, country)`, `.where(filter)`).

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/tools/`

**Playground**: Test suite. For attachments, a fixtures directory with real PDFs/images. For queue bridge, use `Queue.fake()` from `@roostjs/queue`.

**Why this approach**: Pure logic + I/O mocked at the provider boundary. No DO interaction in this phase.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/tools/provider-tools/web-search.ts` | `WebSearch` provider tool builder |
| `packages/ai/src/tools/provider-tools/web-fetch.ts` | `WebFetch` provider tool builder |
| `packages/ai/src/tools/provider-tools/file-search.ts` | `FileSearch` provider tool + `FileSearchQuery` |
| `packages/ai/src/tools/provider-tools/index.ts` | Provider tools subpath |
| `packages/ai/src/attachments/image.ts` | `Files.Image` class with all constructors |
| `packages/ai/src/attachments/document.ts` | `Files.Document` class with all constructors |
| `packages/ai/src/attachments/storable-file.ts` | `StorableFile` interface (shared base) |
| `packages/ai/src/attachments/index.ts` | Attachments subpath |
| `packages/ai/src/queueing/prompt-agent-job.ts` | `PromptAgentJob` extending `Job` from `@roostjs/queue` |
| `packages/ai/src/queueing/queue-bridge.ts` | `agent.queue()`, `agent.queueAfter()`, `.then()`, `.catch()` implementation |
| `packages/ai/src/queueing/callback-registry.ts` | Persistent callback registry (KV-backed by default) for `.then()`/`.catch()` |
| `packages/ai/__tests__/tools/web-search.test.ts` | Builder + provider integration |
| `packages/ai/__tests__/tools/web-fetch.test.ts` | Builder + provider integration |
| `packages/ai/__tests__/tools/file-search.test.ts` | Builder + `where` DSL + provider integration |
| `packages/ai/__tests__/attachments/image.test.ts` | All constructors, mime type detection |
| `packages/ai/__tests__/attachments/document.test.ts` | All constructors, large file handling |
| `packages/ai/__tests__/queueing/queue-bridge.test.ts` | queue(), queueAfter(), then/catch |
| `packages/ai/__tests__/queueing/prompt-agent-job.test.ts` | Job serialization + re-materialization |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/tool.ts` | Add `Tool.name()` optional override; emit kebab-case class name by default |
| `packages/ai/src/agent.ts` | `prompt()` accepts `attachments` option, routes through providers |
| `packages/ai/src/providers/interface.ts` | Chat request schema carries attachments; provider tools encoded in `tools` |
| `packages/ai/src/providers/anthropic.ts` | Attach images/docs per Anthropic schema; emit web_search/web_fetch tool markers |
| `packages/ai/src/providers/openai.ts` | Vision attachments via image_url; web_search via `tools: [{type: 'web_search'}]` |
| `packages/ai/src/providers/gemini.ts` | inline_data parts for attachments; grounding for web_search |
| `packages/ai/src/providers/workers-ai.ts` | Workers AI doesn't have web_search; throw helpful error if used |
| `packages/ai/src/decorators.ts` | Re-export `@Queue`, `@MaxRetries`, `@RetryAfter`, `@Backoff`, `@JobTimeout` from `@roostjs/queue` for agents |
| `packages/ai/src/provider.ts` | `AiServiceProvider` wires `callbackRegistry` + `Dispatcher` |

## Implementation Details

### 1. StorableFile + Attachments API

**Pattern to follow**: Laravel `Files\Document` / `Files\Image` API shape.

**Overview**: `StorableFile` abstract base; `Image` and `Document` subclasses with identical constructor surface. Constructors return lazy objects — bytes only fetched at upload/attach time.

```typescript
// packages/ai/src/attachments/storable-file.ts
export abstract class StorableFile {
  abstract name(): string;
  abstract mimeType(): string;
  abstract bytes(): Promise<Uint8Array>;
  abstract size(): Promise<number>;

  static fromPath(path: string): StorableFile { /* wraps fs read */ }
  static fromStorage(key: string, opts?: { disk?: string }): StorableFile { /* R2/KV via @roostjs/cloudflare */ }
  static fromUrl(url: string): StorableFile { /* wraps fetch */ }
  static fromUpload(file: File): StorableFile { /* wraps Web File */ }
  static fromString(content: string, mime: string): StorableFile { /* in-memory */ }
  static fromId(providerFileId: string, provider?: Lab): StorableFile { /* references pre-uploaded file */ }

  async put(opts?: { provider?: Lab }): Promise<FileRecord> { /* upload to provider Files API; returns { id } */ }
  async get(): Promise<FileRecord> { /* fetch by ID */ }
  async delete(): Promise<void> { /* remove from provider */ }
}
```

**Key decisions**:
- Lazy: `bytes()` fetched only at send.
- `put()` uses provider-specific Files API; shared base stores provider + file ID.
- `Image` adds `.as(name)`, `.quality()`, `.dimensions()` metadata accessors.
- `Document` adds `.pages()` getter (PDF inspection) if available.

**Implementation steps**:
1. Implement `StorableFile` with constructors.
2. Implement `Image` + `Document` with additional metadata methods.
3. Wire `R2Storage` / `KVStore` from `@roostjs/cloudflare` for `fromStorage`.
4. Wire Files API in providers (hooks for P5 Files functionality).

**Feedback loop**: `bun test packages/ai/__tests__/attachments/`

### 2. Web Search Provider Tool

**Pattern to follow**: Laravel `Providers\Tools\WebSearch`.

```typescript
// packages/ai/src/tools/provider-tools/web-search.ts
export class WebSearch implements ProviderTool {
  readonly kind = 'provider';
  readonly name = 'web_search';
  private config: { max?: number; allow?: string[]; location?: { city?: string; region?: string; country?: string } } = {};

  max(n: number): this { this.config.max = n; return this; }
  allow(domains: string[]): this { this.config.allow = domains; return this; }
  location(opts: { city?: string; region?: string; country?: string }): this { this.config.location = opts; return this; }

  toRequest(provider: Lab | string): Record<string, unknown> {
    switch (provider) {
      case Lab.Anthropic: return { type: 'web_search_20250305', max_uses: this.config.max, allowed_domains: this.config.allow, user_location: this.config.location };
      case Lab.OpenAI:    return { type: 'web_search', max_results: this.config.max, allowed_domains: this.config.allow };
      case Lab.Gemini:    return { google_search: {}, grounding_config: { max_results: this.config.max } };
      default: throw new Error(`WebSearch not supported by ${provider}`);
    }
  }
}
```

**Implementation steps**:
1. Define `ProviderTool` interface in `tool.ts`.
2. Implement `WebSearch` with builder chain.
3. Agent's tool-collection logic partitions `Tool` (user) from `ProviderTool` (native) and encodes each correctly.

**Feedback loop**: `bun test packages/ai/__tests__/tools/web-search.test.ts`

### 3. Web Fetch Provider Tool

**Overview**: Identical shape to `WebSearch` — `.max(n)`, `.allow([domains])`. Supported by Anthropic + Gemini only.

**Implementation steps**: Mirror `WebSearch` with fewer options.

### 4. File Search Provider Tool + Query DSL

**Pattern to follow**: Laravel `FileSearchQuery`.

```typescript
// packages/ai/src/tools/provider-tools/file-search.ts
export class FileSearchQuery {
  private filters: Filter[] = [];
  where(field: string, value: unknown): this { this.filters.push({ op: 'eq', field, value }); return this; }
  whereNot(field: string, value: unknown): this { /* ... */ }
  whereIn(field: string, values: unknown[]): this { /* ... */ }
  whereLike(field: string, pattern: string): this { /* ... */ }
  toProviderFilter(provider: Lab): unknown { /* OpenAI: attribute_filter; Gemini: metadata filter */ }
}

export class FileSearch implements ProviderTool {
  constructor(private opts: { stores: string[]; where?: Record<string, unknown> | ((q: FileSearchQuery) => FileSearchQuery) }) {}
  toRequest(provider: Lab): Record<string, unknown> { /* ... */ }
}
```

**Implementation steps**:
1. Define query DSL.
2. Implement `FileSearch` with multi-store support.
3. Translate filter DSL to each provider's filter language.

**Feedback loop**: `bun test packages/ai/__tests__/tools/file-search.test.ts`

### 5. Attachments in Prompt

**Overview**: `agent.prompt(input, { attachments: [...] })` routes through providers.

```typescript
// Usage
const resp = await agent.prompt('Summarize this', {
  attachments: [
    Files.Document.fromStorage('report.pdf'),
    Files.Image.fromUpload(request.file),
  ],
});
```

Provider-level encoding:
- **Anthropic**: `content: [{type: 'document', source: {...}}, {type: 'text', text: input}]`
- **OpenAI**: `content: [{type: 'image_url', ...}, {type: 'text', ...}]`; docs via `file_id` reference
- **Gemini**: `parts: [{inline_data: {mime_type, data}}, {text: input}]`
- **Workers AI**: limited vision support; throw if unsupported model

**Implementation steps**:
1. Add `attachments` to `AgentPromptOptions`.
2. Each provider's `chat()` converts attachments to its format.
3. Handle `fromId(providerFileId)` — skip upload, reference ID.

### 6. Queue Bridge

**Pattern to follow**: `packages/queue/src/dispatcher.ts`, `packages/queue/src/job.ts`.

**Overview**: `agent.queue(input)` dispatches `PromptAgentJob`. `.then()` / `.catch()` registered in callback registry keyed by prompt ID; consumer invokes them on completion.

```typescript
// packages/ai/src/queueing/prompt-agent-job.ts
import { Job, Queue } from '@roostjs/queue';

@Queue('ai-inference')
export class PromptAgentJob extends Job<{
  agentClass: string;
  agentArgs: unknown[];
  input: string;
  options: AgentPromptOptions;
  promptId: string;
}> {
  async handle(): Promise<void> {
    const AgentCtor = agentRegistry.get(this.payload.agentClass);
    const agent = new AgentCtor(...this.payload.agentArgs);
    try {
      const result = await agent.prompt(this.payload.input, this.payload.options);
      await callbackRegistry.fulfill(this.payload.promptId, result);
    } catch (err) {
      await callbackRegistry.reject(this.payload.promptId, err);
      throw err;  // trigger queue retry
    }
  }
}
```

```typescript
// packages/ai/src/queueing/queue-bridge.ts
export class QueuedPromptHandle {
  constructor(public promptId: string) {}
  then(cb: (r: AgentResponse) => void | Promise<void>): this { callbackRegistry.onFulfilled(this.promptId, cb); return this; }
  catch(cb: (e: Error) => void | Promise<void>): this { callbackRegistry.onRejected(this.promptId, cb); return this; }
}
```

Callback registry: KV-backed persistent store so `.then()` survives queue consumer restarts. Callbacks serialized as either closures (in-process) or as URLs for persistent cases.

**Key decisions**:
- In-process: callbacks stored in-memory registry keyed by `promptId`.
- Cross-worker: persist callbacks as webhook URLs (opt-in via `.thenUrl('/webhook')`).
- Default behavior: in-process (matches Laravel's usage); webhook mode for multi-worker.

**Implementation steps**:
1. Register agent classes globally via `agentRegistry.register(SupportAgent)`.
2. Implement `PromptAgentJob` with serialization via constructor args.
3. Implement `QueuedPromptHandle` with callback registry.
4. Implement in-memory + KV-backed registry adapters.

**Feedback loop**: `bun test packages/ai/__tests__/queueing/`

### 7. Queue Decorators on Agents

**Overview**: Re-export queue decorators so `@Queue`, `@MaxRetries`, `@Backoff` work on agent classes. When an agent is queued, its job inherits these.

```typescript
@Queue('premium-ai')
@MaxRetries(5)
@Backoff('exponential')
class PremiumAgent extends Agent { ... }
```

**Implementation steps**:
1. Merge agent config + queue config at dispatch time.
2. `PromptAgentJob` reads agent's queue metadata to configure itself.

## Data Model

Callback registry: stored under prefix `ai:cb:{promptId}` with TTL matching queue retry window (default 1h). Fields: `onFulfilled` (callback ref), `onRejected` (callback ref), `result?`, `error?`.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tools/web-search.test.ts` | Builder chain; provider-specific request shape; unsupported provider throws |
| `tools/web-fetch.test.ts` | Same |
| `tools/file-search.test.ts` | Query DSL; multi-store; filter translation |
| `attachments/image.test.ts` | All 6 constructors; mime detection; .put() flow |
| `attachments/document.test.ts` | Large file streaming; PDF page count |
| `queueing/queue-bridge.test.ts` | queue(), queueAfter(), then/catch invocation order |
| `queueing/prompt-agent-job.test.ts` | Serialize/re-materialize; retry path |

**Key test cases**:
- `WebSearch.max(5).allow(['example.com']).location({country:'US'})` produces correct Anthropic+OpenAI+Gemini bodies
- `FileSearch.where('author','x').whereNot('draft',true)` produces correct OpenAI attribute_filter
- `Files.Image.fromUpload(file).bytes()` reads lazily (not on construction)
- `agent.queue('test').then(r => ...).catch(e => ...)` registers both callbacks
- Re-materialized agent uses the same provider + config as the caller

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/queueing.miniflare.test.ts` | Real Queue → consumer re-materializes agent → `.then()` fires |

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Provider tool used with unsupported provider | Throw at request-build time with named unsupported provider |
| Attachment > provider size limit | Validate client-side; throw `AttachmentTooLargeError` |
| `fromId` with non-existent provider file ID | Provider rejects; surface as typed `FileNotFoundError` |
| Queue consumer can't find agent class | `agentRegistry` registry miss → log, move to DLQ |
| Callback registry TTL expired before consumer fires | Silent drop; document in Failure Modes |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Attachments | Large file memory spike | 50MB PDF loaded to bytes() | Worker hits memory limit | Stream when possible; recommend `.put()` + `fromId()` reference pattern |
| Queue bridge | Callback never fires | Registry TTL expires | Caller hangs waiting | Document: TTL default 1h; `.timeout(seconds)` option |
| Queue bridge | Agent class rename | Serialized class name stale | `agentRegistry` miss | Document: don't rename queued agent classes without migration |
| WebSearch | Domain allow-list too restrictive | Empty search results | Agent gives empty answer | Surface `ProviderToolEmpty` event |
| FileSearch | Store deleted mid-query | External ops | Provider throws | Surface provider error as `VectorStoreGoneError` |
| PromptAgentJob | Deserialization fails | Payload schema changed | Job retries all attempts then DLQs | Version payload; add migrations on breaking changes |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/tools/
bun test packages/ai/__tests__/attachments/
bun test packages/ai/__tests__/queueing/
bun test packages/ai/__tests__/integration/queueing.miniflare.test.ts
```

## Rollout Considerations

- **Feature flag**: None.
- **Queue binding**: Ensure `@roostjs/queue`'s `JobConsumer` is wired in user's app.
- **Rollback**: Tools + attachments backward-compat (opt-in via options).

## Open Items

- [ ] Confirm agent class serialization strategy — static `register()` vs module-level self-registration.
- [ ] Decide max default attachment size (start at 20MB; warn > 10MB).
