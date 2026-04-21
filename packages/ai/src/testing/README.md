# `@roostjs/ai/testing`

First-class fakes and assertions for every primitive. No network required.

## Agent fakes

```ts
import { Support } from './agents/support.ts';

Support.fake(['canned reply', (prompt) => `echo:${prompt.input}`]);

const r = await new Support().prompt('hi');
Support.assertPrompted('hi');
Support.assertNotPrompted('other');

Support.restore();
```

Pass a function to generate responses based on the prompt; pass a plain string
for a deterministic reply.

## `preventStrayPrompts`

```ts
Support.fake().preventStrayPrompts();
// Any .prompt() not matched by a canned response throws — useful in CI.
```

## Auto-fake structured output

```ts
class ReportAgent extends Agent implements HasStructuredOutput {
  schema(s) { return { summary: s.string(), tags: s.array().items(s.string()) }; }
}

ReportAgent.fake();
const { data } = await new ReportAgent().prompt('anything');
// data is schema-valid, auto-generated
```

## Feature fakes

```ts
import { Image, Audio, Transcription, Embeddings, Reranking, Files, Stores } from '@roostjs/ai';

Image.fake(); Audio.fake(); Transcription.fake();
Embeddings.fake(); Reranking.fake(); Files.fake(); Stores.fake();

Image.assertGenerated((r) => r.prompt === 'dog');
Embeddings.assertEmbedded(['hi']);
Files.assertStored((f) => f.filename === 'doc.pdf');
Stores.assertCreated('policy-docs');
```

Every fake ships with `assertX`, `assertNothingX`, and `restore()` members.

## `TestStatefulAgentHarness`

```ts
import { TestStatefulAgentHarness } from '@roostjs/ai/testing';

const { agent, state, advance, cleanup } = TestStatefulAgentHarness
  .for(Support)
  .withSessions('conv-1', nodes)
  .withMockClock(new Date('2026-04-20'))
  .withEnv({ SOME_BINDING: stub })
  .build();

await agent.prompt('hi');
advance(60); // move clock forward 60s
cleanup();
```

Backed by `MockDurableObjectState` — no miniflare required for unit tests.
