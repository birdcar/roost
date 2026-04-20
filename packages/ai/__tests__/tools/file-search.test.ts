import { describe, it, expect } from 'bun:test';
import { FileSearch, FileSearchQuery } from '../../src/tools/provider-tools/index.js';
import { UnsupportedProviderToolError } from '../../src/tool.js';
import { Lab } from '../../src/enums.js';

describe('FileSearch provider tool', () => {
  it('requires at least one store', () => {
    expect(() => new FileSearch({ stores: [] })).toThrow();
  });

  it('produces an OpenAI file_search with vector_store_ids', () => {
    const fs = new FileSearch({ stores: ['vs_1', 'vs_2'] });
    const body = fs.toRequest(Lab.OpenAI);
    expect(body).toMatchObject({
      type: 'file_search',
      vector_store_ids: ['vs_1', 'vs_2'],
    });
  });

  it('translates a .where DSL callback into OpenAI attribute_filter', () => {
    const fs = new FileSearch({
      stores: ['vs_1'],
      where: (q) => q.where('author', 'nick').whereNot('draft', true),
    });
    const body = fs.toRequest(Lab.OpenAI);
    expect(body.filters).toEqual({
      type: 'and',
      filters: [
        { type: 'eq', key: 'author', value: 'nick' },
        { type: 'ne', key: 'draft', value: true },
      ],
    });
  });

  it('collapses a single-clause filter without an AND wrapper', () => {
    const body = new FileSearch({ stores: ['vs_1'], where: { author: 'nick' } }).toRequest(Lab.OpenAI);
    expect(body.filters).toEqual({ type: 'eq', key: 'author', value: 'nick' });
  });

  it('translates filters into a Gemini-shaped retrieval block', () => {
    const fs = new FileSearch({
      stores: ['corpus-1'],
      where: (q) => q.whereIn('category', ['docs', 'faq']),
      maxResults: 5,
    });
    const body = fs.toRequest(Lab.Gemini);
    expect(body).toMatchObject({
      retrieval: {
        vertex_rag_store: {
          rag_resources: [{ rag_corpus: 'corpus-1' }],
          filter: { conditions: [{ field: 'category', operator: 'in', value: ['docs', 'faq'] }] },
          similarity_top_k: 5,
        },
      },
    });
  });

  it('throws UnsupportedProviderToolError for Anthropic/Workers AI', () => {
    const fs = new FileSearch({ stores: ['vs_1'] });
    expect(() => fs.toRequest(Lab.Anthropic)).toThrow(UnsupportedProviderToolError);
    expect(() => fs.toRequest(Lab.WorkersAI)).toThrow(UnsupportedProviderToolError);
  });

  it('FileSearchQuery.whereLike records a like-op filter', () => {
    const q = new FileSearchQuery().whereLike('title', 'RFC-%');
    expect(q.toArray()).toEqual([{ op: 'like', field: 'title', value: 'RFC-%' }]);
  });
});
