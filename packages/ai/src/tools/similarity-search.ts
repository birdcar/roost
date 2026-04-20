import { schema as schemaBuilder, type SchemaBuilder } from '@roostjs/schema';
import type { Tool, ToolRequest } from '../tool.js';

export interface SimilaritySearchOptions {
  using: (query: string) => Promise<unknown[]>;
  description?: string;
  limit?: number;
}

/**
 * Agent-facing semantic search tool. Two construction paths:
 *
 *   // 1) Direct closure
 *   new SimilaritySearch({ using: async q => Database.search(q) })
 *
 *   // 2) Via ORM model with a vector column
 *   SimilaritySearch.usingModel(Document, 'embedding', { limit: 10 })
 *
 * The `using` closure is the integration seam — `.usingModel()` constructs one
 * internally that delegates to the ORM's vector-similarity query builder.
 */
export class SimilaritySearch implements Tool {
  private _description: string;
  private readonly limit: number;

  constructor(private readonly opts: SimilaritySearchOptions) {
    this._description = opts.description ?? 'Search the knowledge base by semantic similarity.';
    this.limit = opts.limit ?? 20;
  }

  name(): string {
    return 'similarity-search';
  }

  description(): string {
    return this._description;
  }

  withDescription(desc: string): this {
    this._description = desc;
    return this;
  }

  schema(s: typeof schemaBuilder): Record<string, SchemaBuilder> {
    return { query: s.string().description('Natural language query') };
  }

  async handle(request: ToolRequest): Promise<string> {
    const query = request.get<string>('query');
    const results = await this.opts.using(query);
    return JSON.stringify(results.slice(0, this.limit));
  }

  /**
   * Bind to an ORM model that exposes a vector-similarity query. The
   * `queryVectorSimilarTo` hook is resolved at call time so apps can plug in
   * any ORM (including `@roostjs/orm` once it ships `whereVectorSimilarTo`).
   */
  static usingModel<TModel extends ModelLike>(
    modelClass: TModel,
    column: string,
    opts: { minSimilarity?: number; limit?: number; description?: string } = {},
  ): SimilaritySearch {
    return new SimilaritySearch({
      description: opts.description,
      limit: opts.limit,
      using: async (query: string) => {
        if (typeof modelClass.queryVectorSimilarTo === 'function') {
          return modelClass.queryVectorSimilarTo(column, query, {
            minSimilarity: opts.minSimilarity ?? 0.5,
            limit: opts.limit ?? 10,
          });
        }
        throw new Error(
          `Model '${(modelClass as { name?: string }).name ?? 'unknown'}' does not implement static queryVectorSimilarTo(column, query, opts). ` +
          `Either add this hook, or pass a { using } closure directly to SimilaritySearch.`,
        );
      },
    });
  }
}

export interface ModelLike {
  name?: string;
  queryVectorSimilarTo?(
    column: string,
    query: string,
    opts: { minSimilarity: number; limit: number },
  ): Promise<unknown[]>;
}
