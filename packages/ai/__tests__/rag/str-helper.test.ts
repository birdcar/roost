import { describe, it, expect, afterEach } from 'bun:test';
import { Str, setEmbeddingPipeline } from '../../src/rag/str-helper.js';
import { EmbeddingPipeline } from '../../src/rag/embedding-pipeline.js';
import { EmbeddingCache } from '../../src/rag/embedding-cache.js';
import type { AIClient, KVStore } from '@roostjs/cloudflare';

class FakeAIClient {
  calls: Array<{ model: string; inputs: string[] }> = [];
  async run<T>(model: string, opts: { text: string[] }): Promise<T> {
    this.calls.push({ model, inputs: [...opts.text] });
    return { data: opts.text.map(() => [0.1, 0.2]) } as unknown as T;
  }
}

class FakeKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

describe('Str.toEmbeddings', () => {
  afterEach(() => setEmbeddingPipeline(null));

  it('throws when no pipeline is registered', async () => {
    await expect(Str.toEmbeddings('hi')).rejects.toThrow(/No default EmbeddingPipeline/);
  });

  it('delegates to the registered pipeline', async () => {
    const client = new FakeAIClient();
    setEmbeddingPipeline(new EmbeddingPipeline(client as unknown as AIClient));
    const vec = await Str.toEmbeddings('hello');
    expect(vec).toEqual([0.1, 0.2]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.inputs).toEqual(['hello']);
  });

  it('uses cache when pipeline was configured with one', async () => {
    const client = new FakeAIClient();
    const kv = new FakeKV();
    const cache = new EmbeddingCache(kv as unknown as KVStore);
    const pipeline = new EmbeddingPipeline(client as unknown as AIClient, undefined, { cache });
    setEmbeddingPipeline(pipeline);

    await Str.toEmbeddings('cached');
    await Str.toEmbeddings('cached');
    expect(client.calls).toHaveLength(1);
  });

  it('bypasses cache when cache:false is passed', async () => {
    const client = new FakeAIClient();
    const kv = new FakeKV();
    const cache = new EmbeddingCache(kv as unknown as KVStore);
    const pipeline = new EmbeddingPipeline(client as unknown as AIClient, undefined, { cache });
    setEmbeddingPipeline(pipeline);

    await Str.toEmbeddings('x', { cache: false });
    await Str.toEmbeddings('x', { cache: false });
    expect(client.calls).toHaveLength(2);
  });
});
