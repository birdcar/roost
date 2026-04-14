import type { Document, Chunk } from './types.js';

export abstract class Chunker {
  abstract chunk(document: Document): Chunk[];
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateWordTokens(word: string): number {
  return Math.ceil(word.length / 4);
}

export class TextChunker extends Chunker {
  private chunkSize: number;
  private overlapPercent: number;

  constructor(options: { chunkSize?: number; overlapPercent?: number } = {}) {
    super();
    this.chunkSize = options.chunkSize ?? 400;
    this.overlapPercent = options.overlapPercent ?? 0.10;
  }

  chunk(document: Document): Chunk[] {
    const words = document.text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [];

    const overlapCount = Math.floor(this.chunkSize * this.overlapPercent);
    const chunks: Chunk[] = [];
    let wordIndex = 0;
    let chunkIndex = 0;

    while (wordIndex < words.length) {
      const chunkWords: string[] = [];
      let tokenCount = 0;

      let i = wordIndex;
      while (i < words.length && tokenCount + estimateWordTokens(words[i]) <= this.chunkSize) {
        chunkWords.push(words[i]);
        tokenCount += estimateWordTokens(words[i]);
        i++;
      }

      // If no words were added (single word exceeds chunkSize), force include it
      if (chunkWords.length === 0 && i < words.length) {
        chunkWords.push(words[i]);
        tokenCount = estimateWordTokens(words[i]);
        i++;
      }

      const text = chunkWords.join(' ');
      chunks.push({
        id: `${document.id}:${chunkIndex}`,
        documentId: document.id,
        text,
        tokenCount: estimateTokenCount(text),
        metadata: document.metadata ? { ...document.metadata } : undefined,
      });

      chunkIndex++;

      // Only apply overlap when there are more words remaining after this chunk.
      // Cap overlap to chunkWords.length - 1 to guarantee forward progress.
      const hasMore = wordIndex + chunkWords.length < words.length;
      const effectiveOverlap = hasMore
        ? Math.min(overlapCount, chunkWords.length - 1)
        : 0;
      const advance = Math.max(1, chunkWords.length - effectiveOverlap);
      wordIndex += advance;
    }

    return chunks;
  }
}

const HEADING_RE = /^#{1,6}\s/;

export class SemanticChunker extends Chunker {
  private chunkSize: number;
  private overlapPercent: number;
  private textChunker: TextChunker;

  constructor(options: { chunkSize?: number; overlapPercent?: number } = {}) {
    super();
    this.chunkSize = options.chunkSize ?? 400;
    this.overlapPercent = options.overlapPercent ?? 0.10;
    this.textChunker = new TextChunker(options);
  }

  chunk(document: Document): Chunk[] {
    // Split on headings and double newlines
    const rawSegments = document.text.split(/(?=\n#{1,6}\s)|\n\n+/);
    const nonEmpty = rawSegments.map((s) => s.trim()).filter((s) => s.length > 0);

    if (nonEmpty.length === 0) return [];

    // Merge sub-threshold segments with the next one
    const minThreshold = this.chunkSize * 0.1;
    const merged: string[] = [];

    let pending = '';
    for (let i = 0; i < nonEmpty.length; i++) {
      const seg = nonEmpty[i];
      const combined = pending ? `${pending}\n\n${seg}` : seg;

      if (estimateTokenCount(combined) < minThreshold && i < nonEmpty.length - 1) {
        pending = combined;
      } else {
        merged.push(combined);
        pending = '';
      }
    }

    // Flush any remaining pending content
    if (pending) {
      if (merged.length > 0) {
        merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${pending}`;
      } else {
        merged.push(pending);
      }
    }

    // For each segment, sub-chunk if it exceeds chunkSize
    const allChunks: Chunk[] = [];
    let globalChunkIndex = 0;

    for (const segment of merged) {
      const segTokens = estimateTokenCount(segment);

      if (segTokens > this.chunkSize) {
        const segDoc: Document = {
          id: document.id,
          text: segment,
          metadata: document.metadata,
        };
        const subChunks = this.textChunker.chunk(segDoc);
        for (const sub of subChunks) {
          allChunks.push({
            ...sub,
            id: `${document.id}:${globalChunkIndex}`,
          });
          globalChunkIndex++;
        }
      } else {
        allChunks.push({
          id: `${document.id}:${globalChunkIndex}`,
          documentId: document.id,
          text: segment,
          tokenCount: segTokens,
          metadata: document.metadata ? { ...document.metadata } : undefined,
        });
        globalChunkIndex++;
      }
    }

    return allChunks;
  }
}
