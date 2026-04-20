import { describe, it, expect, afterEach, mock } from 'bun:test';
import { Stores, configureStores } from '../../src/rag/stores/stores.js';
import type { VectorStore } from '@roostjs/cloudflare';
import type { EmbeddingPipeline } from '../../src/rag/embedding-pipeline.js';
import { Document } from '../../src/attachments/index.js';
import { Files } from '../../src/rag/files/files.js';
import { validateMetadata } from '../../src/rag/stores/metadata.js';
import { MetadataValidationError } from '../../src/rag/types.js';

function makeIndex(): { index: VectorStore; insertCalls: VectorizeVector[][]; deleteCalls: string[][] } {
  const insertCalls: VectorizeVector[][] = [];
  const deleteCalls: string[][] = [];
  const index = {
    insert: mock(async (vectors: VectorizeVector[]) => {
      insertCalls.push(vectors);
      return { ids: vectors.map((v) => v.id), mutationId: '' };
    }),
    query: mock(async () => ({ matches: [], count: 0 })),
    getByIds: mock(async () => []),
    deleteByIds: mock(async (ids: string[]) => {
      deleteCalls.push(ids);
      return { ids, mutationId: '' };
    }),
  } as unknown as VectorStore;
  return { index, insertCalls, deleteCalls };
}

function makeEmbeddings(): EmbeddingPipeline {
  return { embed: mock(async () => [[0.1, 0.2]]) } as unknown as EmbeddingPipeline;
}

describe('Stores.fake', () => {
  afterEach(() => Stores.restore());

  it('create() tracks the name and returns a fake handle', async () => {
    Stores.fake();
    const handle = await Stores.create('kb', { description: 'knowledge base' });
    expect(handle.name).toBe('kb');
    expect(() => Stores.assertCreated('kb')).not.toThrow();
    expect(() => Stores.assertCreated('missing')).toThrow();
  });

  it('handle.add records metadata and handle.assertAdded passes', async () => {
    Stores.fake();
    const handle = await Stores.create('kb');
    await handle.add('file_abc', { metadata: { author: 'nick' } });
    expect(() => handle.assertAdded('file_abc')).not.toThrow();
    expect(() => handle.assertAdded('nope')).toThrow();
  });

  it('handle.remove + deleteFile:true records intent', async () => {
    Stores.fake();
    const handle = await Stores.create('kb');
    await handle.add('file_abc');
    await handle.remove('file_abc', { deleteFile: true });
    expect(() => handle.assertRemoved('file_abc')).not.toThrow();
  });

  it('assertNothingCreated throws after any create()', async () => {
    Stores.fake();
    await Stores.create('x');
    expect(() => Stores.assertNothingCreated()).toThrow();
  });
});

describe('Stores with configured Vectorize backend', () => {
  afterEach(() => {
    Stores.restore();
    Files.restore();
    configureStores(null);
  });

  it('add() inserts a vector with namespace and merged metadata', async () => {
    const { index, insertCalls } = makeIndex();
    configureStores({ index, embeddings: makeEmbeddings(), namespacePrefix: 'app' });
    Files.fake();
    const handle = await Stores.create('kb');
    await handle.add(Document.fromString('doc body', 'text/plain'), { metadata: { author: 'nick' } });

    expect(insertCalls).toHaveLength(1);
    const vec = insertCalls[0]![0]!;
    expect(vec.namespace).toBe(`app:${handle.id}`);
    expect((vec.metadata as Record<string, unknown>).author).toBe('nick');
    expect((vec.metadata as Record<string, unknown>).storeId).toBe(handle.id);
  });

  it('remove() calls deleteByIds with the vector id', async () => {
    const { index, deleteCalls } = makeIndex();
    configureStores({ index, embeddings: makeEmbeddings(), namespacePrefix: 'app' });
    Files.fake();
    const handle = await Stores.create('kb');
    await handle.add(Document.fromString('x', 'text/plain'));
    await handle.remove(handle._recordedAdds()[0]!.fileId);
    expect(deleteCalls).toHaveLength(1);
  });
});

describe('validateMetadata', () => {
  it('allows primitive and array-of-primitive values', () => {
    const out = validateMetadata({ author: 'nick', count: 3, active: true, tags: ['a', 'b'] });
    expect(out).toEqual({ author: 'nick', count: 3, active: true, tags: ['a', 'b'] });
  });

  it('drops undefined fields', () => {
    const out = validateMetadata({ author: 'nick', missing: undefined });
    expect(out).toEqual({ author: 'nick' });
  });

  it('rejects nested objects with MetadataValidationError', () => {
    expect(() => validateMetadata({ nested: { inner: 1 } })).toThrow(MetadataValidationError);
  });

  it('rejects arrays containing non-primitives', () => {
    expect(() => validateMetadata({ mix: [1, {}] as unknown[] })).toThrow(MetadataValidationError);
  });
});
