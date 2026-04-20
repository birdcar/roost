export { Chunker, TextChunker, SemanticChunker } from './chunker.js';
export { EmbeddingPipeline } from './embedding-pipeline.js';
export type { EmbedCallOptions, EmbeddingPipelineOptions } from './embedding-pipeline.js';
export { EmbeddingCache } from './embedding-cache.js';
export type { EmbeddingCacheKey } from './embedding-cache.js';
export { Str, setEmbeddingPipeline, getEmbeddingPipeline } from './str-helper.js';
export { RAGPipeline } from './pipeline.js';
export type {
  Document,
  Chunk,
  ChunkVector,
  QueryResult,
  RAGPipelineConfig,
  FileRecord,
  StoreRecord,
  StorableFileMetadata,
  RerankResult,
} from './types.js';
export {
  EmbeddingError,
  ProviderQuotaError,
  StoreNotFoundError,
  MetadataValidationError,
  MissingVectorColumnError,
  RerankerUnavailableError,
} from './types.js';

// Files API (lifted from P4 attachments)
export { Files, FilesFake } from './files/files.js';
export type { FilesStoreOptions, FilePredicate } from './files/files.js';
export {
  R2NativeFilesAdapter,
  OpenAIFilesAdapter,
  AnthropicFilesAdapter,
  GeminiFilesAdapter,
  registerFilesAdapter,
  setDefaultFilesAdapter,
  resolveFilesAdapter,
  resetFilesAdapters,
} from './files/storage-providers.js';
export type { FilesAdapter } from './files/storage-providers.js';

// Stores
export {
  Stores,
  StoresFake,
  VectorStoreHandle,
  FakeVectorStoreHandle,
  configureStores,
  getStoresConfig,
} from './stores/stores.js';
export type { StoresCreateOptions, StoresConfig, DocumentRecord } from './stores/stores.js';
export { validateMetadata } from './stores/metadata.js';
export type { StoreMetadata, MetadataValue } from './stores/metadata.js';

// Reranking
export {
  Reranking,
  RerankingBuilder,
  registerReranker,
  setDefaultReranker,
  resolveReranker,
  resetRerankers,
} from './reranking/reranking.js';
export type { RerankingPrompt } from './reranking/reranking.js';
export { CohereReranker } from './reranking/providers/cohere.js';
export type { CohereRerankerConfig, RerankerAdapter } from './reranking/providers/cohere.js';
export { JinaReranker } from './reranking/providers/jina.js';
export type { JinaRerankerConfig } from './reranking/providers/jina.js';

// Events
export {
  GeneratingEmbeddings,
  EmbeddingsGenerated,
  FileStored,
  FileDeleted,
  CreatingStore,
  StoreCreated,
  AddingFileToStore,
  FileAddedToStore,
  RemovingFileFromStore,
  FileRemovedFromStore,
  RerankingStarted,
  Reranked,
} from './events.js';
