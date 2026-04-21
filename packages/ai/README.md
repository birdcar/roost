# @roostjs/ai

> Laravel-ergonomics AI agents for Cloudflare Workers.

`@roostjs/ai` is the agent framework for the Roost stack. It blends Laravel 13's
AI SDK ergonomics with the Cloudflare Agents SDK primitive semantics, delivered
as idiomatic TypeScript for the Workers runtime.

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Configuration](#configuration)
- [Custom Base URLs](#custom-base-urls)
- [Provider Support](#provider-support)
- [Agents](#agents)
  - [Prompting](#prompting)
  - [Conversation Context (Sessions)](#conversation-context-sessions)
  - [Structured Output](#structured-output)
  - [Attachments](#attachments)
  - [Streaming](#streaming)
  - [Broadcasting](#broadcasting)
  - [Queueing](#queueing)
  - [Tools](#tools)
  - [Middleware](#middleware)
  - [Anonymous Agents](#anonymous-agents)
  - [Agent Configuration](#agent-configuration-decorators)
  - [Provider Options](#provider-options)
- [Images](#images)
- [Audio (TTS)](#audio-tts)
- [Transcription (STT)](#transcription-stt)
- [Embeddings](#embeddings)
- [Reranking](#reranking)
- [Files](#files)
- [Vector Stores](#vector-stores)
- [Failover](#failover)
- [Testing](#testing)
- [Events](#events)
- [CF-native additions](#cf-native-additions)
- [Philosophy](#philosophy)

## Introduction

`@roostjs/ai` gives Roost developers the Laravel AI SDK DX on top of Cloudflare
Workers — the same mental model whether you're calling Workers AI directly,
routing external providers via AI Gateway, running durable agents on Durable
Objects, exposing your agents as MCP servers, queueing long-running work, or
streaming SSE to a React client.

Every primitive composes. A `StatefulAgent` decorated with `@Stateful({binding})`
gets Sessions, Schedule, Workflows, sub-agents, MCP, and HITL support for free.

## Installation

```bash
bun add @roostjs/ai
```

Subpaths (opt-in per feature):

```ts
import { Agent } from '@roostjs/ai';
import { RAGPipeline } from '@roostjs/ai/rag';
import { Image, Audio, Transcription } from '@roostjs/ai/media';
import { McpClient, createMcpHandler } from '@roostjs/ai/mcp';
import { useAgent } from '@roostjs/ai/client';
import { requireApproval } from '@roostjs/ai/hitl';
import { chargeForTool } from '@roostjs/ai/payments';
```

## Configuration

Register `AiServiceProvider` in your Roost app:

```ts
// config/app.ts
import { AiServiceProvider, Lab } from '@roostjs/ai';

export default {
  providers: [AiServiceProvider],
  ai: {
    binding: 'AI',
    gateway: { accountId: env.CF_ACCOUNT_ID, gatewayId: 'roost-ai' },
    providers: {
      anthropic: { apiKey: env.ANTHROPIC_KEY },
      openai: { apiKey: env.OPENAI_KEY, organization: env.OPENAI_ORG },
      gemini: { apiKey: env.GEMINI_KEY },
    },
    default: [Lab.Anthropic, Lab.OpenAI],
  },
};
```

## Custom Base URLs

Route external providers through AI Gateway for analytics, caching, and rate
limiting:

```ts
ai: {
  gateway: {
    accountId: 'your-cf-account-id',
    gatewayId: 'your-gateway-id',
  },
}
```

When configured, external providers (OpenAI, Anthropic, Gemini) are routed
through Gateway by default; Workers AI stays direct.

## Provider Support

| Provider   | Transport          | Streaming | Tools | Structured |
|------------|--------------------|-----------|-------|------------|
| Workers AI | direct binding     | ✓         | ✓     | ✓          |
| Anthropic  | Gateway or native  | ✓         | ✓     | ✓          |
| OpenAI     | Gateway or native  | ✓         | ✓     | ✓          |
| Gemini     | Gateway or native  | ✓         | ✓     | ✓          |

## Agents

### Prompting

```ts
import { Agent } from '@roostjs/ai';

class SupportAgent extends Agent {
  instructions() { return 'You are a support bot.'; }
}

const response = await new SupportAgent().prompt('How do I reset my password?');
console.log(response.text);
```

### Conversation Context (Sessions)

For durable conversation state, extend `StatefulAgent` and apply
`RemembersConversations`:

```ts
import { StatefulAgent, RemembersConversations, Stateful } from '@roostjs/ai';

@Stateful({ binding: 'SUPPORT_AGENT' })
class Support extends RemembersConversations(StatefulAgent) {
  instructions() { return 'help'; }
}
```

Conversations persist in Durable Object storage with tree-structured message
history, compaction, and FTS.

### Structured Output

```ts
class ReportAgent extends Agent implements HasStructuredOutput {
  instructions() { return 'Extract structured data.'; }
  schema(s) {
    return { summary: s.string(), tags: s.array().items(s.string()) };
  }
}

const { data } = await new ReportAgent().prompt('Analyze: ...');
console.log(data.tags);
```

### Attachments

```ts
import { Files } from '@roostjs/ai/rag';

const image = await Files.Image.fromUrl('https://example.com/diagram.png');
await new VisualAgent().prompt('Describe this', { attachments: [image] });
```

### Streaming

```ts
for await (const event of new Support().stream('hi')) {
  if (event.type === 'text-delta') process.stdout.write(event.text);
}
```

Vercel AI SDK protocol:

```ts
return new Support().stream('hi').usingVercelDataProtocol();
```

### Broadcasting

```ts
await new Support().broadcast('daily-digest', 'Hello everyone');
```

Connects through `@roostjs/broadcast` to every connected client.

### Queueing

```ts
const handle = new ReportAgent()
  .queue('Analyze Q3 data')
  .then((response) => store(response.text));
```

Bridges to `@roostjs/queue`. Decorate with `@Queue('ai')`, `@MaxRetries(3)`,
`@Backoff('exponential')` for queue metadata.

### Tools

```ts
class LookupTool implements Tool {
  name() { return 'lookup'; }
  description() { return 'Look up a user by id'; }
  schema(s) { return { id: s.string() }; }
  async handle(request) { return queryDB(request.get<string>('id')); }
}

class Support extends Agent implements HasTools {
  tools() { return [new LookupTool(), new WebSearch()]; }
}
```

### Middleware

```ts
class Support extends Agent implements HasMiddleware {
  middleware() {
    return [
      async (prompt, next) => { logPrompt(prompt); return next(prompt); },
    ];
  }
}
```

### Anonymous Agents

```ts
import { agent } from '@roostjs/ai';

const quick = agent({ instructions: 'Be terse.', tools: [new LookupTool()] });
await quick.prompt('hi');
```

### Agent Configuration (decorators)

```ts
@Provider([Lab.Anthropic, Lab.OpenAI])
@Model('anthropic/claude-4-opus')
@MaxTokens(4096)
@Temperature(0.3)
@Timeout(30)
class Precise extends Agent { ... }
```

### Provider Options

```ts
class Support extends Agent implements HasProviderOptions {
  providerOptions(provider) {
    if (provider === Lab.Anthropic) return { reasoning: { maxTokens: 8192 } };
    return {};
  }
}
```

## Images

```ts
import { Image } from '@roostjs/ai/media/image';

const png = await Image.of('a happy dog').square().quality('high').generate();
await Image.of('portrait').store({ bucket: 'R2_IMAGES' });
```

## Audio (TTS)

```ts
import { Audio } from '@roostjs/ai/media/audio';

const mp3 = await Audio.of('Hello world').female().voice('warm').generate();
```

## Transcription (STT)

```ts
import { Transcription } from '@roostjs/ai/media/transcription';

const { text, segments } = await Transcription.fromStorage('R2_AUDIO', 'call.wav')
  .diarize()
  .generate();
```

## Embeddings

```ts
import { EmbeddingPipeline, Str } from '@roostjs/ai/rag';

const vectors = await new EmbeddingPipeline().cache('30d').embed(['hi', 'bye']);
const vec = await Str.toEmbeddings('single doc');
```

## Reranking

```ts
import { Reranking } from '@roostjs/ai/rag';

const reranked = await Reranking.of(hits).usingCohere().rerank();
```

## Files

```ts
import { Files } from '@roostjs/ai/rag';

const stored = await Files.store(blob, { filename: 'doc.pdf' });
await stored.delete();
```

## Vector Stores

```ts
import { Stores } from '@roostjs/ai/rag';

const store = await Stores.create('legal-docs');
await store.add(stored.id, { metadata: { dept: 'legal' } });
await store.remove(stored.id);
```

## Failover

```ts
import { FailoverProvider, AnthropicProvider, WorkersAIProvider } from '@roostjs/ai';

const provider = new FailoverProvider([
  new AnthropicProvider({ apiKey }),
  new WorkersAIProvider(env.AI),
]);
```

Or via decorator: `@Provider([Lab.Anthropic, Lab.WorkersAI])`.

## Testing

```ts
import { Agent, Image, Files } from '@roostjs/ai';

Support.fake(['canned reply']);
Image.fake();
Files.fake();

await new Support().prompt('hi');
Support.assertPrompted('hi');
Image.assertNothingGenerated();

Support.restore();
Image.restore();
```

Structured-output agents auto-generate schema-valid fake data when `fake()` is
called without explicit responses.

## Events

```ts
import { Events } from '@roostjs/events';
import { PromptingAgent, AgentPrompted, GeneratingImage } from '@roostjs/ai';

Events.listen(PromptingAgent, (e) => console.log('about to prompt', e.prompt));
Events.listen(AgentPrompted, (e) => metrics.record(e.response.usage));
```

30+ event classes cover every primitive — see `src/events.ts` and
`src/advanced-events.ts`.

## CF-native additions

Primitives mapped from the Cloudflare Agents SDK — no v0.2 equivalent.

### Stateful Agents

```ts
@Stateful({ binding: 'SUPPORT_AGENT' })
class Support extends StatefulAgent {
  instructions() { return 'help'; }
}
```

### Schedule

```ts
@Scheduled('0 9 * * *')
async sendDigest() { ... }

await agent.schedule(60, 'check', payload);
```

### Workflows

```ts
@Workflow({ binding: 'REPORT_FLOW' })
async processReport(step, reportId: string) {
  const data = await step.do('fetch', () => this.fetchData(reportId));
  return data;
}
```

### Sub-agents

```ts
const summarizer = this.subAgent(SummarizerAgent);
const summary = await summarizer.summarize(doc);
await summarizer.abort();
```

### MCP

```ts
import { McpClient, createMcpHandler } from '@roostjs/ai/mcp';

const github = await McpClient.connect({ url: 'https://mcp.github.com' });
class Bug extends Agent {
  async tools() { return [...await github.tools(), new CustomTool()]; }
}

export default createMcpHandler(Bug, { transport: 'streamable-http' });
```

### HITL

```ts
import { requireApproval } from '@roostjs/ai/hitl';

const result = await requireApproval(this, 'charge', { amount: 500 });
if (result.status === 'approved') chargeCustomer();
```

### Memory

```ts
agent.memory.context.get('tenant');
await agent.memory.shortForm.set('draft', text);
const hits = await agent.memory.knowledge.query({ query: 'policies' });
```

### Payments

```ts
import { chargeForTool } from '@roostjs/ai/payments';

const premium = chargeForTool(new ReportTool(), { amount: 100, currency: 'usd' });
```

### Voice / Email / Browser / CodeMode

See `src/voice/`, `src/email/`, `src/browser/`, `src/code-mode/` and the
corresponding CHANGELOG entries.

## Philosophy

v0.3 integrates the **semantics** of every Cloudflare Agents SDK primitive via
Roost-native implementations rather than by inheriting the SDK's base classes.
`StatefulAgent implements DurableObject` directly; sub-agent RPC uses
`@roostjs/cloudflare`'s `DurableObjectClient`; MCP uses `@modelcontextprotocol/sdk`
transports without the SDK's `McpAgent` base.

This keeps Roost agents consistent with other Roost DO primitives (`ChannelDO`,
`RateLimiterDO`) and avoids competing lifecycle assumptions. Users migrating
from the Cloudflare Agents SDK gain Laravel DX without losing any CF-native
power.

See [MIGRATION.md](./MIGRATION.md) for v0.2 → v0.3 upgrade notes.

## License

MIT. See [LICENSE](../../LICENSE).
