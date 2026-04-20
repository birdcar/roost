import { Reranking } from './reranking.js';

/**
 * Opt-in global augmentation: `[{...}].rerank(by, query)` returns items
 * sorted by relevance. Import this module (side-effect only) to enable:
 *
 *     import '@roostjs/ai/rag/reranking/collection-macro';
 *     const top = await docs.rerank('text', 'my query');
 *
 * Avoided by default — not every consumer wants `Array.prototype` polluted.
 */
declare global {
  interface Array<T> {
    rerank(
      by: keyof T | ((item: T) => string),
      query: string,
      opts?: { provider?: string; model?: string; limit?: number },
    ): Promise<T[]>;
  }
}

if (!('rerank' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'rerank', {
    value: async function <T>(
      this: T[],
      by: keyof T | ((item: T) => string),
      query: string,
      opts: { provider?: string; model?: string; limit?: number } = {},
    ): Promise<T[]> {
      const texts = this.map((item) =>
        typeof by === 'function' ? by(item) : String((item as Record<string, unknown>)[by as string] ?? ''),
      );
      const builder = Reranking.of(texts);
      if (opts.limit !== undefined) builder.limit(opts.limit);
      const ranked = await builder.rerank(query, { provider: opts.provider, model: opts.model });
      return ranked.map((r) => this[r.index]!);
    },
    writable: true,
    configurable: true,
  });
}

export {};
