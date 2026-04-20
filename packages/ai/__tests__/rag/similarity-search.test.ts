import { describe, it, expect } from 'bun:test';
import { SimilaritySearch } from '../../src/tools/similarity-search.js';
import { createToolRequest } from '../../src/tool.js';

describe('SimilaritySearch — closure mode', () => {
  it('handle() passes the query to the `using` closure and returns JSON', async () => {
    const captured: string[] = [];
    const tool = new SimilaritySearch({
      using: async (q) => {
        captured.push(q);
        return [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
      },
    });
    const result = await tool.handle(createToolRequest({ query: 'hello' }));
    expect(captured).toEqual(['hello']);
    expect(JSON.parse(result)).toEqual([{ id: 1, text: 'a' }, { id: 2, text: 'b' }]);
  });

  it('withDescription overrides the default description', () => {
    const tool = new SimilaritySearch({ using: async () => [] }).withDescription('Search docs');
    expect(tool.description()).toBe('Search docs');
  });

  it('uses kebab-case name "similarity-search"', () => {
    const tool = new SimilaritySearch({ using: async () => [] });
    expect(tool.name()).toBe('similarity-search');
  });

  it('applies the limit to the returned slice', async () => {
    const tool = new SimilaritySearch({
      using: async () => Array.from({ length: 50 }, (_, i) => ({ i })),
      limit: 5,
    });
    const raw = await tool.handle(createToolRequest({ query: 'x' }));
    expect(JSON.parse(raw)).toHaveLength(5);
  });
});

describe('SimilaritySearch.usingModel', () => {
  it('delegates to the model\'s queryVectorSimilarTo hook', async () => {
    const calls: Array<{ column: string; query: string; opts: Record<string, unknown> }> = [];
    const MockModel = {
      name: 'Document',
      async queryVectorSimilarTo(column: string, query: string, opts: Record<string, unknown>) {
        calls.push({ column, query, opts });
        return [{ id: 'a', score: 0.9 }];
      },
    };

    const tool = SimilaritySearch.usingModel(MockModel, 'embedding', {
      minSimilarity: 0.7,
      limit: 3,
      description: 'Search documents',
    });
    expect(tool.description()).toBe('Search documents');

    const raw = await tool.handle(createToolRequest({ query: 'hi' }));
    expect(JSON.parse(raw)).toEqual([{ id: 'a', score: 0.9 }]);
    expect(calls[0]!).toEqual({
      column: 'embedding',
      query: 'hi',
      opts: { minSimilarity: 0.7, limit: 3 },
    });
  });

  it('throws a helpful error when the model lacks the hook', async () => {
    const Unsupported = { name: 'Bad' } as Record<string, unknown>;
    const tool = SimilaritySearch.usingModel(Unsupported, 'embedding');
    await expect(tool.handle(createToolRequest({ query: 'x' }))).rejects.toThrow(/queryVectorSimilarTo/);
  });
});
