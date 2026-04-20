import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import {
  Reranking,
  registerReranker,
  setDefaultReranker,
  resetRerankers,
} from '../../src/rag/reranking/reranking.js';
import { CohereReranker } from '../../src/rag/reranking/providers/cohere.js';
import { JinaReranker } from '../../src/rag/reranking/providers/jina.js';
import { Lab } from '../../src/enums.js';

describe('CohereReranker', () => {
  afterEach(() => resetRerankers());

  it('calls /v1/rerank and maps results back onto the docs array', async () => {
    const adapter = new CohereReranker({ apiKey: 'key' });
    registerReranker(Lab.Cohere, adapter);
    setDefaultReranker(Lab.Cohere);

    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { index: 2, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.5 },
          ],
        }),
        { status: 200 },
      ),
    );

    const docs = ['a', 'b', 'c'];
    const results = await Reranking.of(docs).limit(2).rerank('query', { provider: Lab.Cohere });

    expect(results).toEqual([
      { index: 2, document: 'c', score: 0.9 },
      { index: 0, document: 'a', score: 0.5 },
    ]);

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://api.cohere.com/v1/rerank');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.top_n).toBe(2);
    expect(body.documents).toEqual(docs);

    spy.mockRestore();
  });

  it('surfaces RerankerUnavailableError on non-200', async () => {
    registerReranker(Lab.Cohere, new CohereReranker({ apiKey: 'key' }));
    setDefaultReranker(Lab.Cohere);
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(Reranking.of(['a']).rerank('q')).rejects.toThrow(/cohere/);
    spy.mockRestore();
  });
});

describe('JinaReranker', () => {
  afterEach(() => resetRerankers());

  it('calls /v1/rerank and includes document text when returned', async () => {
    registerReranker(Lab.Jina, new JinaReranker({ apiKey: 'key' }));
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.8, document: { text: 'hello' } },
          ],
        }),
        { status: 200 },
      ),
    );
    const results = await Reranking.of(['a', 'hello']).rerank('q', { provider: Lab.Jina });
    expect(results).toEqual([{ index: 1, document: 'hello', score: 0.8 }]);
    spy.mockRestore();
  });
});

describe('Reranking.fake', () => {
  afterEach(() => Reranking.restore());

  it('records the prompt and returns queued responses', async () => {
    Reranking.fake([
      [{ index: 1, document: 'b', score: 0.9 }],
    ]);
    const results = await Reranking.of(['a', 'b']).rerank('q');
    expect(results).toEqual([{ index: 1, document: 'b', score: 0.9 }]);
    expect(() => Reranking.assertReranked((p) => p.query === 'q')).not.toThrow();
    expect(() => Reranking.assertReranked((p) => p.query === 'missing')).toThrow();
  });

  it('empty docs returns empty results without calling the provider', async () => {
    resetRerankers(); // ensure no adapter
    const results = await Reranking.of([]).rerank('q');
    expect(results).toEqual([]);
  });
});

describe('collection macro', () => {
  afterEach(() => {
    Reranking.restore();
    // @ts-expect-error — test cleanup
    delete Array.prototype.rerank;
  });

  it('augments Array.prototype with a rerank() method that returns sorted items', async () => {
    await import('../../src/rag/reranking/collection-macro.js');
    Reranking.fake([
      [
        { index: 2, document: 'c', score: 0.9 },
        { index: 0, document: 'a', score: 0.5 },
      ],
    ]);
    const items = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    const ranked = await items.rerank('text', 'query');
    expect(ranked).toEqual([{ text: 'c' }, { text: 'a' }]);
  });
});
