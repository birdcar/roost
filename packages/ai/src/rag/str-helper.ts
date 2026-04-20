import type { EmbeddingPipeline, EmbedCallOptions } from './embedding-pipeline.js';

let defaultPipeline: EmbeddingPipeline | null = null;

export function setEmbeddingPipeline(pipeline: EmbeddingPipeline | null): void {
  defaultPipeline = pipeline;
}

export function getEmbeddingPipeline(): EmbeddingPipeline {
  if (!defaultPipeline) {
    throw new Error(
      `No default EmbeddingPipeline registered. Call setEmbeddingPipeline(pipeline) during app boot (AiServiceProvider does this automatically when configured).`,
    );
  }
  return defaultPipeline;
}

export const Str = {
  /**
   * Generate embeddings for a single text via the registered EmbeddingPipeline.
   * Pass `cache: false` to bypass cache even when one is configured.
   */
  async toEmbeddings(text: string, opts: EmbedCallOptions = {}): Promise<number[]> {
    const pipeline = getEmbeddingPipeline();
    const [vec] = await pipeline.embed([text], opts);
    if (!vec) {
      throw new Error('EmbeddingPipeline returned no vector for input.');
    }
    return vec;
  },
};
