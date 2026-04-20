import { Lab } from '../../enums.js';
import { UnsupportedProviderToolError } from '../../tool.js';

type FilterOp = 'eq' | 'neq' | 'in' | 'like';

export interface FileSearchFilter {
  op: FilterOp;
  field: string;
  value: unknown;
}

export class FileSearchQuery {
  private filters: FileSearchFilter[] = [];

  where(field: string, value: unknown): this {
    this.filters.push({ op: 'eq', field, value });
    return this;
  }

  whereNot(field: string, value: unknown): this {
    this.filters.push({ op: 'neq', field, value });
    return this;
  }

  whereIn(field: string, values: unknown[]): this {
    this.filters.push({ op: 'in', field, value: values });
    return this;
  }

  whereLike(field: string, pattern: string): this {
    this.filters.push({ op: 'like', field, value: pattern });
    return this;
  }

  /** Exposed for testing + for FileSearch to inspect collected filters. */
  toArray(): FileSearchFilter[] {
    return [...this.filters];
  }

  toProviderFilter(provider: Lab | string): unknown {
    switch (provider) {
      case Lab.OpenAI: {
        if (this.filters.length === 0) return undefined;
        const clauses = this.filters.map(toOpenAIFilter);
        return clauses.length === 1 ? clauses[0] : { type: 'and', filters: clauses };
      }
      case Lab.Gemini: {
        if (this.filters.length === 0) return undefined;
        return { conditions: this.filters.map(toGeminiFilter) };
      }
      default:
        throw new UnsupportedProviderToolError('file_search', provider);
    }
  }
}

function toOpenAIFilter(f: FileSearchFilter): Record<string, unknown> {
  switch (f.op) {
    case 'eq':
      return { type: 'eq', key: f.field, value: f.value };
    case 'neq':
      return { type: 'ne', key: f.field, value: f.value };
    case 'in':
      return { type: 'in', key: f.field, value: f.value };
    case 'like':
      return { type: 'like', key: f.field, value: f.value };
  }
}

function toGeminiFilter(f: FileSearchFilter): Record<string, unknown> {
  return { field: f.field, operator: f.op, value: f.value };
}

export interface FileSearchOptions {
  stores: string[];
  where?: Record<string, unknown> | ((q: FileSearchQuery) => FileSearchQuery);
  maxResults?: number;
}

export class FileSearch {
  readonly kind = 'provider' as const;
  readonly name = 'file_search' as const;

  constructor(private readonly opts: FileSearchOptions) {
    if (!opts.stores || opts.stores.length === 0) {
      throw new Error("FileSearch requires at least one vector store via { stores: [...] }.");
    }
  }

  private buildQuery(): FileSearchQuery {
    const q = new FileSearchQuery();
    const where = this.opts.where;
    if (!where) return q;
    if (typeof where === 'function') return where(q);
    for (const [field, value] of Object.entries(where)) q.where(field, value);
    return q;
  }

  toRequest(provider: Lab | string): Record<string, unknown> {
    const q = this.buildQuery();
    switch (provider) {
      case Lab.OpenAI: {
        const filter = q.toProviderFilter(Lab.OpenAI);
        return {
          type: 'file_search',
          vector_store_ids: this.opts.stores,
          ...(this.opts.maxResults !== undefined ? { max_num_results: this.opts.maxResults } : {}),
          ...(filter ? { filters: filter } : {}),
        };
      }
      case Lab.Gemini: {
        const filter = q.toProviderFilter(Lab.Gemini);
        return {
          retrieval: {
            vertex_rag_store: {
              rag_resources: this.opts.stores.map((id) => ({ rag_corpus: id })),
              ...(filter ? { filter } : {}),
              ...(this.opts.maxResults !== undefined ? { similarity_top_k: this.opts.maxResults } : {}),
            },
          },
        };
      }
      default:
        throw new UnsupportedProviderToolError('file_search', provider);
    }
  }
}
