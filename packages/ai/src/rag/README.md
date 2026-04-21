# `@roostjs/ai/rag`

Retrieval-augmented generation primitives built on Cloudflare Vectorize.

## `RAGPipeline`

```ts
import { RAGPipeline } from '@roostjs/ai/rag';

const pipeline = new RAGPipeline('policy-docs', {
  namespace: 'tenant-42',
  metadataFilter: { dept: 'legal' },
});

await pipeline.ingest([{ text: 'refund policy...', metadata: { ... } }]);
const hits = await pipeline.query('refunds').topK(5);
```

Auto-fakes in tests:

```ts
RAGPipeline.fake();
await pipeline.query('anything');
RAGPipeline.assertQueried('anything');
RAGPipeline.restore();
```

## `EmbeddingPipeline`

```ts
import { EmbeddingPipeline, Str } from '@roostjs/ai/rag';

const vectors = await new EmbeddingPipeline().cache('30d').embed(['a', 'b']);
const single = await Str.toEmbeddings('one doc');
```

Caching is KV-backed; default TTL is 30 days.

## `Files` / `Stores`

```ts
import { Files, Stores } from '@roostjs/ai/rag';

const file = await Files.store(blob, { filename: 'doc.pdf' });
const store = await Stores.create('legal-docs');
await store.add(file.id, { metadata: { dept: 'legal' } });
await store.remove(file.id);
```

## `Reranking`

```ts
import { Reranking } from '@roostjs/ai/rag';

const reranked = await Reranking.of(hits).usingCohere().rerank();
```

Rerank providers route through AI Gateway where supported.

## `SimilaritySearch`

```ts
import { SimilaritySearch } from '@roostjs/ai/rag';

await SimilaritySearch
  .usingModel(Document)
  .whereVectorSimilarTo('embeddings_col', queryVec)
  .topK(10);
```

Integrates with `@roostjs/orm` models backed by Vectorize columns.
