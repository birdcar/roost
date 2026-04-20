import { describe, it, expect, mock } from 'bun:test';
import { RAGPipeline } from '../../src/rag/pipeline.js';
import type { VectorStore } from '@roostjs/cloudflare';
import type { EmbeddingPipeline } from '../../src/rag/embedding-pipeline.js';
import type { Chunker } from '../../src/rag/chunker.js';

function makeStore(matches: VectorizeMatch[] = []): { store: VectorStore; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const store = {
    insert: mock(async () => ({ ids: [], mutationId: '' })),
    query: mock(async (_vec: number[], opts: Record<string, unknown>) => {
      calls.push(opts);
      return { matches, count: matches.length };
    }),
    getByIds: mock(async () => []),
    deleteByIds: mock(async () => ({ ids: [], mutationId: '' })),
  } as unknown as VectorStore;
  return { store, calls };
}

function makeEmbeddings(vec: number[] = [0.1]): EmbeddingPipeline {
  return { embed: mock(async () => [vec]) } as unknown as EmbeddingPipeline;
}

function makeChunker(): Chunker {
  return { chunk: mock(() => []) } as unknown as Chunker;
}

describe('RAGPipeline.query namespace + filter + threshold', () => {
  it('passes per-query namespace through to the vector store', async () => {
    const { store, calls } = makeStore();
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker());
    await pipeline.query('hi', { namespace: 'tenant-a' });
    expect(calls[0]!.namespace).toBe('tenant-a');
  });

  it('prefers per-query namespace over pipeline-configured namespace', async () => {
    const { store, calls } = makeStore();
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker(), { namespace: 'default' });
    await pipeline.query('hi', { namespace: 'override' });
    expect(calls[0]!.namespace).toBe('override');
  });

  it('passes a metadata filter through to the vector store', async () => {
    const { store, calls } = makeStore();
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker());
    await pipeline.query('hi', { filter: { author: 'nick' } });
    expect(calls[0]!.filter).toEqual({ author: 'nick' });
  });

  it('uses per-query minSimilarity over config default', async () => {
    const matches: VectorizeMatch[] = [
      { id: 'a', score: 0.9, values: [], metadata: { text: 'hit-a' } },
      { id: 'b', score: 0.4, values: [], metadata: { text: 'hit-b' } },
    ] as unknown as VectorizeMatch[];
    const { store } = makeStore(matches);
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker());
    const above = await pipeline.query('hi', { minSimilarity: 0.8 });
    expect(above).toHaveLength(1);
    const below = await pipeline.query('hi', { minSimilarity: 0.3 });
    expect(below).toHaveLength(2);
  });

  it('defaults similarity threshold to 0.5', async () => {
    const matches: VectorizeMatch[] = [
      { id: 'a', score: 0.6, values: [], metadata: { text: 'a' } },
      { id: 'b', score: 0.4, values: [], metadata: { text: 'b' } },
    ] as unknown as VectorizeMatch[];
    const { store } = makeStore(matches);
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker());
    const results = await pipeline.query('hi');
    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.id).toBe('a');
  });

  it('omits filter/namespace when not provided', async () => {
    const { store, calls } = makeStore();
    const pipeline = new RAGPipeline(store, makeEmbeddings(), makeChunker());
    await pipeline.query('hi');
    expect('filter' in calls[0]!).toBe(false);
    expect('namespace' in calls[0]!).toBe(false);
  });
});
