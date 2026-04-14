import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { RAGPipeline } from '../pipeline.js';
import type { Document, QueryResult } from '../types.js';
import type { VectorStore } from '@roostjs/cloudflare';
import type { EmbeddingPipeline } from '../embedding-pipeline.js';
import type { Chunker } from '../chunker.js';
import type { Chunk } from '../types.js';

function makeChunker(chunks: Chunk[]): Chunker {
  return {
    chunk: mock(() => chunks),
  } as unknown as Chunker;
}

function makeEmbeddings(vectors: number[][]): EmbeddingPipeline {
  return {
    embed: mock(async () => vectors),
  } as unknown as EmbeddingPipeline;
}

function makeStore(queryResult?: VectorizeMatches): VectorStore {
  return {
    insert: mock(async () => ({ ids: [], mutationId: '' })),
    query: mock(async () => queryResult ?? { matches: [], count: 0 }),
    getByIds: mock(async () => []),
    deleteByIds: mock(async () => ({ ids: [], mutationId: '' })),
  } as unknown as VectorStore;
}

const sampleDoc: Document = { id: 'doc1', text: 'Hello world', metadata: { src: 'test' } };

const sampleChunk: Chunk = {
  id: 'doc1:0',
  documentId: 'doc1',
  text: 'Hello world',
  tokenCount: 3,
  metadata: { src: 'test' },
};

describe('RAGPipeline.ingest()', () => {
  test('calls chunker, embedding pipeline, and VectorStore.insert in sequence', async () => {
    const chunker = makeChunker([sampleChunk]);
    const embeddings = makeEmbeddings([[0.1, 0.2, 0.3]]);
    const store = makeStore();

    const pipeline = new RAGPipeline(store, embeddings, chunker);
    const result = await pipeline.ingest([sampleDoc]);

    expect(result).toEqual({ inserted: 1 });
    expect((chunker.chunk as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((embeddings.embed as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((store.insert as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });

  test('stores chunk text in vector metadata', async () => {
    const chunker = makeChunker([sampleChunk]);
    const embeddings = makeEmbeddings([[0.1, 0.2, 0.3]]);
    const store = makeStore();

    const pipeline = new RAGPipeline(store, embeddings, chunker);
    await pipeline.ingest([sampleDoc]);

    const insertCalls = (store.insert as ReturnType<typeof mock>).mock.calls;
    const vectors = insertCalls[0][0] as VectorizeVector[];
    expect(vectors[0].metadata).toMatchObject({ text: 'Hello world', documentId: 'doc1' });
  });
});

describe('RAGPipeline.query()', () => {
  test('embeds the query and calls VectorStore.query with configured topK and namespace', async () => {
    const store = makeStore({ matches: [], count: 0 });
    const embeddings = makeEmbeddings([[0.5, 0.6]]);
    const chunker = makeChunker([]);

    const pipeline = new RAGPipeline(store, embeddings, chunker, {
      topK: 3,
      namespace: 'tenant-1',
      similarityThreshold: 0,
    });

    await pipeline.query('find this');

    const queryCalls = (store.query as ReturnType<typeof mock>).mock.calls;
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0][0]).toEqual([0.5, 0.6]);
    expect(queryCalls[0][1]).toMatchObject({ topK: 3, namespace: 'tenant-1', returnMetadata: 'all' });
  });

  test('filters results below similarityThreshold', async () => {
    const matches: VectorizeMatch[] = [
      { id: 'doc1:0', score: 0.9, metadata: { text: 'good', documentId: 'doc1' } },
      { id: 'doc1:1', score: 0.5, metadata: { text: 'low', documentId: 'doc1' } },
    ];
    const store = makeStore({ matches, count: 2 });
    const embeddings = makeEmbeddings([[0.5]]);
    const chunker = makeChunker([]);

    const pipeline = new RAGPipeline(store, embeddings, chunker, { similarityThreshold: 0.75 });
    const results = await pipeline.query('test');

    expect(results).toHaveLength(1);
    expect(results[0].chunk.text).toBe('good');
  });

  test('returns results sorted by score descending', async () => {
    const matches: VectorizeMatch[] = [
      { id: 'doc1:0', score: 0.8, metadata: { text: 'second', documentId: 'doc1' } },
      { id: 'doc1:1', score: 0.95, metadata: { text: 'first', documentId: 'doc1' } },
      { id: 'doc1:2', score: 0.82, metadata: { text: 'third', documentId: 'doc1' } },
    ];
    const store = makeStore({ matches, count: 3 });
    const embeddings = makeEmbeddings([[0.5]]);
    const chunker = makeChunker([]);

    const pipeline = new RAGPipeline(store, embeddings, chunker, { similarityThreshold: 0 });
    const results = await pipeline.query('test');

    expect(results[0].score).toBe(0.95);
    expect(results[1].score).toBe(0.82);
    expect(results[2].score).toBe(0.8);
  });
});

describe('RAGPipeline.fake()', () => {
  beforeEach(() => {
    RAGPipeline.restore();
  });

  test('ingest() records calls without calling real dependencies', async () => {
    RAGPipeline.fake();

    const store = makeStore();
    const embeddings = makeEmbeddings([]);
    const chunker = makeChunker([]);
    const pipeline = new RAGPipeline(store, embeddings, chunker);

    const result = await pipeline.ingest([sampleDoc]);

    expect(result).toEqual({ inserted: 0 });
    expect((store.insert as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
    expect((embeddings.embed as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
    expect((chunker.chunk as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test('query() returns canned responses in order', async () => {
    const first: QueryResult[] = [{ chunk: { ...sampleChunk, id: 'doc1:0' }, score: 0.9 }];
    const second: QueryResult[] = [{ chunk: { ...sampleChunk, id: 'doc1:1' }, score: 0.8 }];
    RAGPipeline.fake([first, second]);

    const store = makeStore();
    const embeddings = makeEmbeddings([]);
    const chunker = makeChunker([]);
    const pipeline = new RAGPipeline(store, embeddings, chunker);

    const r1 = await pipeline.query('first query');
    const r2 = await pipeline.query('second query');

    expect(r1).toEqual(first);
    expect(r2).toEqual(second);
  });

  test('assertIngested() passes when ingest was called', async () => {
    RAGPipeline.fake();

    const pipeline = new RAGPipeline(makeStore(), makeEmbeddings([]), makeChunker([]));
    await pipeline.ingest([sampleDoc]);

    expect(() => RAGPipeline.assertIngested()).not.toThrow();
  });

  test('assertQueried() passes when query text includes expected text', async () => {
    RAGPipeline.fake();

    const pipeline = new RAGPipeline(makeStore(), makeEmbeddings([]), makeChunker([]));
    await pipeline.query('find the needle in haystack');

    expect(() => RAGPipeline.assertQueried((t) => t.includes('needle'))).not.toThrow();
  });

  test('assertIngested() throws when ingest was never called', () => {
    RAGPipeline.fake();
    expect(() => RAGPipeline.assertIngested()).toThrow('never called');
  });

  test('assertQueried() throws when query was never called', () => {
    RAGPipeline.fake();
    expect(() => RAGPipeline.assertQueried()).toThrow('never called');
  });

  test('restore() clears the fake', async () => {
    RAGPipeline.fake();
    RAGPipeline.restore();

    const store = makeStore();
    const embeddings = makeEmbeddings([[0.1]]);
    const chunker = makeChunker([sampleChunk]);

    const pipeline = new RAGPipeline(store, embeddings, chunker, { similarityThreshold: 0 });
    await pipeline.ingest([sampleDoc]);

    // Real dependencies should have been called
    expect((store.insert as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });
});
