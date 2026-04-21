# Migrating from `@roostjs/ai` v0.2 to v0.3

v0.3.0 is a breaking rewrite aligned with the Cloudflare Agents SDK's production-grade
primitives and Laravel 13's AI SDK ergonomics. Every v0.2 public API was reviewed;
this guide documents every user-visible change. An automated codemod is future work
— for now, the regex recipes below locate affected call sites manually.

## Breaking Changes Summary

| Area | Change | Migration |
|---|---|---|
| Agent | `Agent.prompt()` returns `AgentResponse`, no `{queued: true}` branch | Use `.queue()` for deferred execution |
| Agent | Mixin contracts replace inline messages/tools/structuredOutput | Implement `Conversational` / `HasTools` / etc. |
| Agent | Stateful agents extend `StatefulAgent` (DO-backed) | Opt in via `@Stateful({binding})` |
| Providers | `CloudflareAIProvider` → `WorkersAIProvider` | Rename import |
| Providers | Native adapters are opt-in (`AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`) | Import from `@roostjs/ai` |
| Providers | `@Provider(Lab.X)` accepts arrays for failover | `@Provider([Lab.OpenAI, Lab.Anthropic])` |
| Streaming | `StreamEvent` is a discriminated union (alpha.3+) | Narrow on `.type` before accessing payload |
| RAG | `Files`/`Stores`/`Reranking`/`EmbeddingPipeline` are new | See RAG README |
| Tools | `Tool` interface: `name?/description/schema/handle` | Replace any v0.2 Tool base class |
| Testing | `Agent.fake()` replaces provider-level mocking | See Testing section |
| Events | 20+ new `@roostjs/events`-based Event classes | Listen via `dispatchEvent` |
| Package shape | Subpath exports (`/rag`, `/media`, `/mcp`, `/testing`, `/client`, `/stateful`, `/hitl`, `/memory`, `/payments`, `/voice`, `/email`, `/browser`, `/code-mode`) | Update imports to use subpaths |

---

## Agents

### `Agent.prompt()` return type

**Before (v0.2)**

```ts
const result = await new SupportAgent().prompt('Help', { queued: true });
if (result.queued) console.log(result.taskId);
```

**After (v0.3)**

```ts
const handle = new SupportAgent().queue('Help');
handle.then((response) => console.log(response.text));
```

Regex recipe:

```bash
grep -rnE "\.prompt\([^)]*queued:\s*true" packages/**/*.ts
```

### Opt-in contracts replace inline options

**Before (v0.2)**

```ts
class Support extends Agent {
  instructions = 'help';
  messages = [...];
  tools = [new MyTool()];
  schema = { text: s.string() };
}
```

**After (v0.3)**

```ts
class Support extends Agent implements Conversational, HasTools, HasStructuredOutput {
  instructions() { return 'help'; }
  messages() { return [...]; }
  tools() { return [new MyTool()]; }
  schema(s) { return { text: s.string() }; }
}
```

Each contract is a separate opt-in interface (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions`) detected at runtime via predicates exported from `./contracts.js`.

### Stateful agents on Durable Objects

**Before (v0.2)**: no equivalent — v0.2 agents were stateless.

**After (v0.3)**

```ts
@Stateful({ binding: 'SUPPORT_AGENT' })
class Support extends StatefulAgent {
  instructions() { return 'help'; }
}

// wrangler.toml
[[durable_objects.bindings]]
name = "SUPPORT_AGENT"
class_name = "Support"
```

See `src/stateful/README.md` and the Sessions, Schedule, Workflows, Sub-agents sections below.

### `@Model` accepts provider-scoped names

**Before**

```ts
@Model('claude-3-opus-20240229')
```

**After**

```ts
@Model('anthropic/claude-3-opus-20240229')
// or implicit:
@UseSmartestModel(Lab.Anthropic)
```

---

## Providers

### `CloudflareAIProvider` renamed

**Before**

```ts
import { CloudflareAIProvider } from '@roostjs/ai';
```

**After**

```ts
import { WorkersAIProvider } from '@roostjs/ai';
```

`CloudflareAIProvider` is removed in v0.3.0 (no soft-deprecation re-export — if your code still imports it, the type error is the migration prompt).

### Native provider adapters are opt-in

**Before**: single `CloudflareAIProvider` routing everything through Workers AI.

**After**: separate native adapters for features that Gateway can't fully expose.

```ts
import { AnthropicProvider, OpenAIProvider, GeminiProvider, FailoverProvider } from '@roostjs/ai';

const provider = new FailoverProvider([
  new AnthropicProvider({ apiKey: env.ANTHROPIC_KEY }),
  new WorkersAIProvider(env.AI),
]);
```

### Failover via `@Provider` arrays

```ts
@Provider([Lab.Anthropic, Lab.OpenAI, Lab.WorkersAI])
class Support extends Agent { ... }
```

---

## Streaming

### `StreamEvent` is a discriminated union

**Before (v0.3.0-alpha.1/.2)**

```ts
interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'usage' | 'error' | 'done';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  usage?: Usage;
  message?: string;
  code?: string;
}
```

**After (v0.3.0-alpha.3+)**

```ts
type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };
```

Narrow before accessing payload fields:

```ts
if (event.type === 'text-delta') console.log(event.text);
```

Regex recipe for direct field access:

```bash
grep -rnE "\.toolCall\b|\.toolResult\b|\.message\?" packages/**/*.ts | grep StreamEvent
```

### Vercel AI SDK protocol

```ts
agent.stream('hi').usingVercelDataProtocol();
```

---

## Tools

### `Tool` interface replaces the v0.2 base class

**Before**

```ts
class LookupTool extends Tool {
  name = 'lookup';
  description = '...';
  async handle(args) { ... }
}
```

**After**

```ts
class LookupTool implements Tool {
  name() { return 'lookup'; }
  description() { return '...'; }
  schema(s) { return { id: s.string() }; }
  async handle(request: ToolRequest) { return ...; }
}
```

### Provider tools

```ts
import { WebSearch, WebFetch, FileSearch } from '@roostjs/ai';

class Research extends Agent implements HasTools {
  tools() { return [new WebSearch(), new WebFetch()]; }
}
```

---

## RAG (new)

See `src/rag/README.md`. High-level:

```ts
import { RAGPipeline, Files, Stores, Reranking, Str } from '@roostjs/ai/rag';

const stored = await Files.store(blob, { filename: 'doc.pdf' });
const store = await Stores.create('policy-docs');
await store.add(stored.id, { metadata: { dept: 'legal' } });

const hits = await new RAGPipeline('policy-docs').query('refund policy').topK(5);
const reranked = await Reranking.of(hits).rerank();
```

---

## Testing

### `Agent.fake()` replaces provider mocking

**Before**

```ts
const mockProvider = { async chat() { return { text: 'fake' }; } };
Agent.setProvider(mockProvider);
```

**After**

```ts
Support.fake(['first reply', (prompt) => `echo: ${prompt.input}`]);
await new Support().prompt('hi');
Support.assertPrompted('hi');
Support.restore();
```

### Feature-scoped fakes

```ts
Image.fake(); Audio.fake(); Transcription.fake();
Embeddings.fake(); Reranking.fake(); Files.fake(); Stores.fake();

Image.assertGenerated((r) => r.prompt === 'dog');
Audio.assertNothingGenerated();
```

### Fake structured-output auto-generates data from schema

```ts
ReportAgent.fake(); // no responses supplied
// `prompt()` returns schema-valid data auto-generated from @HasStructuredOutput.schema()
```

### `preventStrayPrompts`

```ts
Support.fake().preventStrayPrompts();
// Any .prompt() not matched by a canned response throws, useful in CI.
```

---

## Events

### `@roostjs/events`-based dispatch

```ts
import { dispatchEvent, PromptingAgent, AgentPrompted } from '@roostjs/ai';
import { Events } from '@roostjs/events';

Events.listen(PromptingAgent, (e) => { /* ... */ });
```

Every primitive dispatches events — see the full list in `src/events.ts` and
`src/advanced-events.ts` (HITL, payments, voice, email, browser, code-mode).

---

## Package Shape

### Subpath exports

**Before**

```ts
import { RAGPipeline } from '@roostjs/ai';
import { Image } from '@roostjs/ai';
```

**After**

```ts
import { RAGPipeline } from '@roostjs/ai/rag';
import { Image } from '@roostjs/ai/media/image';
import { McpClient } from '@roostjs/ai/mcp';
import { useAgent } from '@roostjs/ai/client';
import { Email } from '@roostjs/ai/email';
// Also: /rag, /media, /media/audio, /media/transcription, /mcp,
//       /testing, /client, /stateful, /hitl, /memory, /payments,
//       /voice, /email, /browser, /code-mode
```

Tree-shaking works better; types resolve faster in large projects.

---

## CF-native additions (no v0.2 equivalent)

These are new in v0.3 with no migration path — adopt as needed.

- **Stateful agents on DO** — `@Stateful({binding})` + `extends StatefulAgent`.
- **Sessions** — tree-structured message store with compaction and FTS.
- **Workflows** — `@Workflow()` method decorator backed by `@roostjs/workflow`.
- **Sub-agents** — `this.subAgent(OtherAgent)` typed RPC.
- **MCP** — `McpClient`, `McpAgent`, `createMcpHandler`, `McpPortal`.
- **HITL** — `requireApproval` / `approve` approval state machine.
- **Memory** — four-tier `agent.memory` (context, short-form, knowledge, skills).
- **Payments** — x402 `chargeForTool` + MPP agent-to-agent flow.
- **Voice / Email / Browser / CodeMode** — Phase 8 primitives.

See the main [README](./README.md) "CF-native additions" section for worked examples.

---

## Philosophy note

v0.3 integrates the **semantics** of every Cloudflare Agents SDK primitive
(Sessions, Schedule, Sub-agents, MCP, etc.) via Roost-native implementations —
StatefulAgent implements `DurableObject` directly rather than extending the
SDK's base class. This keeps Roost agents consistent with other Roost DO
primitives (`ChannelDO`, etc.) and avoids competing lifecycle assumptions.

Users migrating from v0.2 who were using the Cloudflare Agents SDK alongside
`@roostjs/ai` can drop the SDK import entirely — every primitive is now
available as a first-class Roost API.
