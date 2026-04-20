import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Stores, configureStores } from '../../src/rag/stores/stores.js';
import { Files } from '../../src/rag/files/files.js';
import { Document } from '../../src/attachments/index.js';
import { SimilaritySearch } from '../../src/tools/similarity-search.js';
import { createToolRequest } from '../../src/tool.js';
import type { VectorStore } from '@roostjs/cloudflare';
import type { EmbeddingPipeline } from '../../src/rag/embedding-pipeline.js';

/**
 * Integration test for the Phase 5 RAG stack. Instead of starting miniflare's
 * Vectorize emulator (slow; not yet on every dev machine), we exercise the
 * same public path with a functional in-process `VectorStore` and
 * `EmbeddingPipeline`. This validates:
 *
 *  - Stores.create().add({metadata}) flows through the adapter boundary.
 *  - Namespaces are auto-prefixed with the app tag.
 *  - Metadata filters scope queries to only matching documents.
 *  - SimilaritySearch tool returns results end-to-end via a closure
 *    that runs against the same in-memory store.
 */

interface StoredVector {
  id: string;
  namespace?: string;
  metadata: Record<string, unknown>;
  values: number[];
}

function makeInMemoryVectorStore(): { store: VectorStore; data: StoredVector[] } {
  const data: StoredVector[] = [];
  const store = {
    async insert(vectors: VectorizeVector[]) {
      for (const v of vectors) {
        data.push({
          id: v.id,
          namespace: v.namespace,
          metadata: (v.metadata ?? {}) as Record<string, unknown>,
          values: Array.from(v.values as number[]),
        });
      }
      return { ids: vectors.map((v) => v.id), mutationId: 'mut-1' };
    },
    async query(_vec: unknown, opts: { topK?: number; namespace?: string; filter?: Record<string, unknown> } = {}) {
      const matches = data
        .filter((v) => (opts.namespace ? v.namespace === opts.namespace : true))
        .filter((v) => {
          if (!opts.filter) return true;
          return Object.entries(opts.filter).every(([k, expected]) => v.metadata[k] === expected);
        })
        .slice(0, opts.topK ?? 5)
        .map((v) => ({ id: v.id, score: 0.9, values: v.values, metadata: v.metadata }));
      return { matches: matches as unknown as VectorizeMatch[], count: matches.length };
    },
    async getByIds() {
      return [];
    },
    async deleteByIds(ids: string[]) {
      for (const id of ids) {
        const i = data.findIndex((v) => v.id === id);
        if (i >= 0) data.splice(i, 1);
      }
      return { ids, mutationId: 'mut-del' };
    },
  } as unknown as VectorStore;
  return { store, data };
}

function makeDeterministicEmbeddings(): EmbeddingPipeline {
  return {
    async embed(texts: string[]) {
      return texts.map((t) => {
        const h = [...t].reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return [h % 10 / 10, (h * 7) % 10 / 10, 0.5];
      });
    },
  } as unknown as EmbeddingPipeline;
}

describe('RAG integration: Stores + Files + SimilaritySearch', () => {
  beforeEach(() => {
    Files.fake();
  });

  afterEach(() => {
    Files.restore();
    Stores.restore();
    configureStores(null);
  });

  it('scopes Stores.get() lookups by namespace prefix', async () => {
    const { store, data } = makeInMemoryVectorStore();
    configureStores({ index: store, embeddings: makeDeterministicEmbeddings(), namespacePrefix: 'app' });

    const a = await Stores.create('tenant-a');
    const b = await Stores.create('tenant-b');
    await a.add(Document.fromString('alpha content', 'text/plain'));
    await b.add(Document.fromString('beta content', 'text/plain'));

    expect(data).toHaveLength(2);
    expect(data[0]!.namespace).toBe(`app:${a.id}`);
    expect(data[1]!.namespace).toBe(`app:${b.id}`);
    expect(data[0]!.namespace).not.toBe(data[1]!.namespace);
  });

  it('filters vector queries by metadata', async () => {
    const { store } = makeInMemoryVectorStore();
    configureStores({ index: store, embeddings: makeDeterministicEmbeddings(), namespacePrefix: 'app' });

    const kb = await Stores.create('kb');
    await kb.add(Document.fromString('nick doc', 'text/plain'), { metadata: { author: 'nick' } });
    await kb.add(Document.fromString('other doc', 'text/plain'), { metadata: { author: 'other' } });

    const matches = await store.query([0, 0, 0], {
      namespace: `app:${kb.id}`,
      filter: { author: 'nick' } as unknown as VectorizeVectorMetadataFilter,
    });
    expect(matches.matches).toHaveLength(1);
    expect((matches.matches[0]!.metadata as Record<string, unknown>).author).toBe('nick');
  });

  it('SimilaritySearch tool returns results via a closure against the store', async () => {
    const { store } = makeInMemoryVectorStore();
    configureStores({ index: store, embeddings: makeDeterministicEmbeddings(), namespacePrefix: 'app' });

    const kb = await Stores.create('kb');
    await kb.add(Document.fromString('hello docs', 'text/plain'), { metadata: { id: '1' } });
    await kb.add(Document.fromString('other docs', 'text/plain'), { metadata: { id: '2' } });

    const tool = new SimilaritySearch({
      using: async (query: string) => {
        const matches = await store.query([0.1, 0.2, 0.5], { namespace: `app:${kb.id}`, topK: 5 });
        return matches.matches.map((m) => ({ id: m.id, query }));
      },
    });

    const raw = await tool.handle(createToolRequest({ query: 'hello' }));
    const parsed = JSON.parse(raw) as Array<{ id: string; query: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]!.query).toBe('hello');
  });

  it('remove(fileId, { deleteFile: true }) both deletes vector and file via Files fake', async () => {
    const { store, data } = makeInMemoryVectorStore();
    configureStores({ index: store, embeddings: makeDeterministicEmbeddings(), namespacePrefix: 'app' });

    const kb = await Stores.create('kb');
    const added = await kb.add(Document.fromString('x', 'text/plain'));
    expect(data).toHaveLength(1);

    await kb.remove(added.fileId, { deleteFile: true });
    expect(data).toHaveLength(0);
    expect(() => Files.assertDeleted(added.fileId)).not.toThrow();
  });
});
