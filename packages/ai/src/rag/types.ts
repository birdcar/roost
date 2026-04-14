export interface Document {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface Chunk {
  id: string;           // `${document.id}:${chunkIndex}`
  documentId: string;
  text: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkVector {
  chunk: Chunk;
  embedding: number[];
}

export interface QueryResult {
  chunk: Chunk;
  score: number;
}

/**
 * Configuration for RAGPipeline.
 *
 * IMPORTANT: If `namespace` is set, it must be used consistently for both
 * `ingest()` and `query()` calls. A namespace mismatch will silently return
 * wrong or empty results — Vectorize does not error on namespace mismatches.
 *
 * The `embeddingModel` must match the dimensionality of the Vectorize index.
 * BGE-base-en-v1.5 (default) produces 768-dimensional vectors. If the index
 * was created with a different dimension count, `VectorStore.insert()` will
 * throw a CF error.
 */
export interface RAGPipelineConfig {
  /** Default: 400 */
  chunkSize?: number;
  /** Default: 0.10 */
  overlapPercent?: number;
  /** Default: '@cf/baai/bge-base-en-v1.5' */
  embeddingModel?: string;
  /** Default: 5 */
  topK?: number;
  /** Default: 0.75 */
  similarityThreshold?: number;
  /** Vectorize namespace for multi-tenancy */
  namespace?: string;
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}
