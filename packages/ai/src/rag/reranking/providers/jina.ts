import type { RerankResult } from '../../types.js';
import { RerankerUnavailableError } from '../../types.js';
import type { RerankerAdapter } from './cohere.js';

export interface JinaRerankerConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class JinaReranker implements RerankerAdapter {
  readonly provider = 'jina';

  constructor(private config: JinaRerankerConfig) {}

  async rerank(
    query: string,
    documents: string[],
    opts: { limit?: number; model?: string } = {},
  ): Promise<RerankResult[]> {
    const url = `${this.config.baseUrl ?? 'https://api.jina.ai'}/v1/rerank`;
    const model = opts.model ?? this.config.model ?? 'jina-reranker-v2-base-multilingual';

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
      results: Array<{ index: number; relevance_score: number; document?: { text: string } }>;
    };
    return data.results.map((r) => ({
      index: r.index,
      document: r.document?.text ?? documents[r.index]!,
      score: r.relevance_score,
    }));
  }
}
