import { describe, test, expect, mock } from 'bun:test';
import { EmbeddingPipeline } from '../embedding-pipeline.js';
import { EmbeddingError } from '../types.js';
import type { AIClient } from '@roostjs/cloudflare';

function makeClient(result: unknown): AIClient {
  return {
    run: mock(async () => result),
    poll: mock(async () => ({ status: 'running' as const })),
  } as unknown as AIClient;
}

describe('EmbeddingPipeline', () => {
  test('embed([]) returns [] without calling AIClient', async () => {
    const client = makeClient({ data: [] });
    const pipeline = new EmbeddingPipeline(client);

    const result = await pipeline.embed([]);

    expect(result).toEqual([]);
    expect((client.run as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test("embed(['a', 'b']) calls AIClient.run with the configured model and { text: ['a', 'b'] }", async () => {
    const embeddings = [[0.1, 0.2], [0.3, 0.4]];
    const client = makeClient({ data: embeddings });
    const pipeline = new EmbeddingPipeline(client, '@cf/baai/bge-base-en-v1.5');

    const result = await pipeline.embed(['a', 'b']);

    expect(result).toEqual(embeddings);
    const calls = (client.run as ReturnType<typeof mock>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('@cf/baai/bge-base-en-v1.5');
    expect(calls[0][1]).toEqual({ text: ['a', 'b'] });
  });

  test('throws EmbeddingError when result.data is undefined', async () => {
    const client = makeClient({});
    const pipeline = new EmbeddingPipeline(client);

    expect(pipeline.embed(['hello'])).rejects.toThrow(EmbeddingError);
    expect(pipeline.embed(['hello'])).rejects.toThrow('No embedding data returned from model');
  });

  test('throws EmbeddingError when returned array length mismatches input length', async () => {
    // Return only 1 embedding for 2 inputs
    const client = makeClient({ data: [[0.1, 0.2]] });
    const pipeline = new EmbeddingPipeline(client);

    expect(pipeline.embed(['a', 'b'])).rejects.toThrow(EmbeddingError);
    expect(pipeline.embed(['a', 'b'])).rejects.toThrow('Embedding count mismatch: expected 2, got 1');
  });
});
