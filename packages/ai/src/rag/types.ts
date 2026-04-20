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
  /** Default: 0.5 */
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

/* --------------------------- Phase 5: Files + Stores + Reranking --------------------------- */

export interface FileRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  provider?: string;
  createdAt?: number;
}

export interface StoreRecord {
  id: string;
  name: string;
  description?: string;
  fileCounts: { total: number; ready: number };
  provider?: string;
  createdAt?: number;
}

export interface StorableFileMetadata {
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface RerankResult {
  index: number;
  document: string;
  score: number;
}

export class ProviderQuotaError extends Error {
  override readonly name = 'ProviderQuotaError';
  constructor(provider: string, detail?: string) {
    super(`Provider '${provider}' quota exceeded${detail ? `: ${detail}` : ''}. Consider the Vectorize fallback.`);
  }
}

export class StoreNotFoundError extends Error {
  override readonly name = 'StoreNotFoundError';
  constructor(id: string, provider?: string) {
    super(`Vector store '${id}'${provider ? ` (provider: ${provider})` : ''} not found.`);
  }
}

export class MetadataValidationError extends Error {
  override readonly name = 'MetadataValidationError';
  constructor(issue: string) {
    super(`Metadata validation failed: ${issue}`);
  }
}

export class MissingVectorColumnError extends Error {
  override readonly name = 'MissingVectorColumnError';
  constructor(model: string, column: string) {
    super(
      `Model '${model}' does not have a vector column '${column}'. Use .usingModel() with a column that has been configured for embeddings.`,
    );
  }
}

export class RerankerUnavailableError extends Error {
  override readonly name = 'RerankerUnavailableError';
  constructor(provider: string, cause?: string) {
    super(`Reranker '${provider}' unavailable${cause ? `: ${cause}` : ''}.`);
  }
}
