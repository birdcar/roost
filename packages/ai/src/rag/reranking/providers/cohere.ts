import type { RerankResult } from '../../types.js';
import { RerankerUnavailableError } from '../../types.js';

export interface CohereRerankerConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface RerankerAdapter {
  readonly provider: string;
  rerank(query: string, documents: string[], opts?: { limit?: number; model?: string }): Promise<RerankResult[]>;
}

export class CohereReranker implements RerankerAdapter {
  readonly provider = 'cohere';

  constructor(private config: CohereRerankerConfig) {}

  async rerank(
    query: string,
    documents: string[],
    opts: { limit?: number; model?: string } = {},
  ): Promise<RerankResult[]> {
    const url = `${this.config.baseUrl ?? 'https://api.cohere.com'}/v1/rerank`;
    const model = opts.model ?? this.config.model ?? 'rerank-english-v3.0';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        ...(opts.limit !== undefined ? { top_n: opts.limit } : {}),
      }),
    });
    if (!res.ok) throw new RerankerUnavailableError(this.provider, `${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };
    return data.results.map((r) => ({
      index: r.index,
      document: documents[r.index]!,
      score: r.relevance_score,
    }));
  }
}
