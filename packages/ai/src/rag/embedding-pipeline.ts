import type { AIClient } from '@roostjs/cloudflare';
import { EmbeddingError } from './types.js';

export class EmbeddingPipeline {
  constructor(
    private client: AIClient,
    private model = '@cf/baai/bge-base-en-v1.5',
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const result = await this.client.run<{ data: number[][] }>(this.model, { text: texts });

    if (!result || !('data' in result) || result.data === undefined || result.data === null) {
      throw new EmbeddingError('No embedding data returned from model');
    }

    if (result.data.length !== texts.length) {
      throw new EmbeddingError(
        `Embedding count mismatch: expected ${texts.length}, got ${result.data.length}`,
      );
    }

    return result.data;
  }
}
