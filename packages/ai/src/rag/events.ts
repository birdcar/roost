import { Event } from '@roostjs/events';
import type { FileRecord, StoreRecord, RerankResult } from './types.js';

/** Dispatched before an embedding batch is generated. */
export class GeneratingEmbeddings extends Event {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    public readonly inputCount: number,
  ) {
    super();
  }
}

/** Dispatched after an embedding batch completes. */
export class EmbeddingsGenerated extends Event {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    public readonly vectorCount: number,
    public readonly cacheHits: number = 0,
  ) {
    super();
  }
}

/** Dispatched after a file is stored in a provider's Files API. */
export class FileStored extends Event {
  constructor(
    public readonly record: FileRecord,
    public readonly provider: string,
  ) {
    super();
  }
}

/** Dispatched after a file is deleted from a provider's Files API. */
export class FileDeleted extends Event {
  constructor(
    public readonly fileId: string,
    public readonly provider: string,
  ) {
    super();
  }
}

/** Dispatched before a vector store is created. */
export class CreatingStore extends Event {
  constructor(
    public readonly name: string,
    public readonly description?: string,
  ) {
    super();
  }
}

/** Dispatched after a vector store is created. */
export class StoreCreated extends Event {
  constructor(public readonly record: StoreRecord) {
    super();
  }
}

/** Dispatched before a file is added to a vector store. */
export class AddingFileToStore extends Event {
  constructor(
    public readonly storeId: string,
    public readonly fileIdOrName: string,
  ) {
    super();
  }
}

/** Dispatched after a file has been added to a vector store. */
export class FileAddedToStore extends Event {
  constructor(
    public readonly storeId: string,
    public readonly fileId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super();
  }
}

/** Dispatched before a file is removed from a vector store. */
export class RemovingFileFromStore extends Event {
  constructor(
    public readonly storeId: string,
    public readonly fileId: string,
  ) {
    super();
  }
}

/** Dispatched after a file has been removed from a vector store. */
export class FileRemovedFromStore extends Event {
  constructor(
    public readonly storeId: string,
    public readonly fileId: string,
    public readonly deletedFile: boolean,
  ) {
    super();
  }
}

/** Dispatched before a reranking operation. */
export class RerankingStarted extends Event {
  constructor(
    public readonly provider: string,
    public readonly query: string,
    public readonly docCount: number,
  ) {
    super();
  }
}

/** Dispatched after a reranking operation. */
export class Reranked extends Event {
  constructor(
    public readonly provider: string,
    public readonly query: string,
    public readonly results: RerankResult[],
  ) {
    super();
  }
}
