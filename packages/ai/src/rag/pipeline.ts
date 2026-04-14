import type { VectorStore } from '@roostjs/cloudflare';
import type { Document, Chunk, QueryResult, RAGPipelineConfig } from './types.js';
import type { EmbeddingPipeline } from './embedding-pipeline.js';
import type { Chunker } from './chunker.js';

const fakes = new WeakMap<typeof RAGPipeline, RAGPipelineFake>();

export class RAGPipeline {
  constructor(
    private store: VectorStore,
    private embeddings: EmbeddingPipeline,
    private chunker: Chunker,
    private config: RAGPipelineConfig = {},
  ) {}

  async ingest(documents: Document[]): Promise<{ inserted: number }> {
    const fake = fakes.get(RAGPipeline);
    if (fake) {
      fake.recordIngest(documents);
      return { inserted: 0 };
    }

    const allChunks: Chunk[] = [];
    for (const doc of documents) {
      const chunks = this.chunker.chunk(doc);
      allChunks.push(...chunks);
    }

    if (allChunks.length === 0) return { inserted: 0 };

    const texts = allChunks.map((c) => c.text);
    const embeddings = await this.embeddings.embed(texts);

    const vectors: VectorizeVector[] = allChunks.map((chunk, i) => ({
      id: chunk.id,
      values: embeddings[i],
      ...(this.config.namespace ? { namespace: this.config.namespace } : {}),
      metadata: {
        ...chunk.metadata,
        documentId: chunk.documentId,
        text: chunk.text,
      },
    }));

    await this.store.insert(vectors);
    return { inserted: vectors.length };
  }

  async query(text: string): Promise<QueryResult[]> {
    const fake = fakes.get(RAGPipeline);
    if (fake) {
      fake.recordQuery(text);
      return fake.nextQueryResponse();
    }

    const [queryVector] = await this.embeddings.embed([text]);
    const matches = await this.store.query(queryVector, {
      topK: this.config.topK ?? 5,
      ...(this.config.namespace ? { namespace: this.config.namespace } : {}),
      returnMetadata: 'all',
    });

    const threshold = this.config.similarityThreshold ?? 0.75;

    const results: QueryResult[] = matches.matches
      .filter((m) => m.score >= threshold)
      .map((m) => {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const chunkText = typeof meta['text'] === 'string' ? meta['text'] : '';
        const documentId = typeof meta['documentId'] === 'string' ? meta['documentId'] : '';

        // Reconstruct remaining metadata (exclude internal fields)
        const { text: _t, documentId: _d, tokenCount: _tc, ...remainder } = meta as Record<string, unknown> & {
          text?: unknown;
          documentId?: unknown;
          tokenCount?: unknown;
        };

        const chunk: Chunk = {
          id: m.id,
          documentId,
          text: chunkText,
          tokenCount: Math.ceil(chunkText.length / 4),
          metadata: Object.keys(remainder).length > 0 ? remainder : undefined,
        };

        return { chunk, score: m.score };
      });

    return results.sort((a, b) => b.score - a.score);
  }

  static fake(responses?: QueryResult[][]): void {
    fakes.set(RAGPipeline, new RAGPipelineFake(responses));
  }

  static restore(): void {
    fakes.delete(RAGPipeline);
  }

  static assertIngested(predicate?: (docs: Document[]) => boolean): void {
    const fake = fakes.get(RAGPipeline);
    if (!fake) throw new Error('RAGPipeline.fake() was not called');

    if (fake.ingestedBatches.length === 0) {
      throw new Error('Expected ingest() to be called, but it was never called');
    }

    if (predicate) {
      const matched = fake.ingestedBatches.some(predicate);
      if (!matched) {
        throw new Error('Expected ingest() to be called with matching documents, but no batch matched the predicate');
      }
    }
  }

  static assertQueried(predicate?: (text: string) => boolean): void {
    const fake = fakes.get(RAGPipeline);
    if (!fake) throw new Error('RAGPipeline.fake() was not called');

    if (fake.queriedTexts.length === 0) {
      throw new Error('Expected query() to be called, but it was never called');
    }

    if (predicate) {
      const matched = fake.queriedTexts.some(predicate);
      if (!matched) {
        throw new Error('Expected query() to be called with matching text, but no query matched the predicate');
      }
    }
  }
}

class RAGPipelineFake {
  ingestedBatches: Document[][] = [];
  queriedTexts: string[] = [];
  private responses: QueryResult[][];
  private responseIndex = 0;

  constructor(responses?: QueryResult[][]) {
    this.responses = responses ?? [[]];
  }

  recordIngest(docs: Document[]): void {
    this.ingestedBatches.push(docs);
  }

  recordQuery(text: string): void {
    this.queriedTexts.push(text);
  }

  nextQueryResponse(): QueryResult[] {
    const response = this.responses[this.responseIndex] ?? this.responses[this.responses.length - 1] ?? [];
    this.responseIndex++;
    return response;
  }
}
