import { describe, test, expect } from 'bun:test';
import { TextChunker, SemanticChunker } from '../chunker.js';

describe('TextChunker', () => {
  test('splits text into chunks no larger than chunkSize tokens', () => {
    // ~4 chars per token, chunkSize=10 means ~40 chars per chunk
    const chunker = new TextChunker({ chunkSize: 10, overlapPercent: 0 });
    const doc = {
      id: 'doc1',
      text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
    };

    const chunks = chunker.chunk(doc);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(10 * 1.5); // some slack for word boundary estimates
    }
  });

  test('overlap: last N tokens of chunk N appear at start of chunk N+1', () => {
    const chunker = new TextChunker({ chunkSize: 10, overlapPercent: 0.2 });
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    const doc = { id: 'doc1', text: words.join(' ') };

    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);

    // The last words of chunk[0] should appear at the start of chunk[1]
    const chunk0Words = chunks[0].text.split(' ');
    const chunk1Words = chunks[1].text.split(' ');

    const overlapCount = Math.floor(10 * 0.2); // 2
    const tailOfChunk0 = chunk0Words.slice(-overlapCount);
    const headOfChunk1 = chunk1Words.slice(0, overlapCount);

    expect(headOfChunk1).toEqual(tailOfChunk0);
  });

  test('returns [] on empty string', () => {
    const chunker = new TextChunker();
    const chunks = chunker.chunk({ id: 'doc1', text: '' });
    expect(chunks).toEqual([]);
  });

  test('returns one chunk when text is shorter than chunkSize', () => {
    const chunker = new TextChunker({ chunkSize: 400 });
    const doc = { id: 'doc1', text: 'short text here' };
    const chunks = chunker.chunk(doc);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('short text here');
    expect(chunks[0].id).toBe('doc1:0');
    expect(chunks[0].documentId).toBe('doc1');
  });

  test('copies document metadata onto each chunk', () => {
    const chunker = new TextChunker({ chunkSize: 5, overlapPercent: 0 });
    const doc = {
      id: 'doc1',
      text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa',
      metadata: { source: 'test', version: 1 },
    };

    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.metadata).toEqual({ source: 'test', version: 1 });
    }
  });

  test('chunk ids are stable and unique', () => {
    const chunker = new TextChunker({ chunkSize: 5, overlapPercent: 0 });
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const doc = { id: 'mydoc', text: words.join(' ') };

    const chunks = chunker.chunk(doc);
    const ids = chunks.map((c) => c.id);
    const unique = new Set(ids);

    expect(unique.size).toBe(ids.length);
    expect(ids[0]).toBe('mydoc:0');
  });
});

describe('SemanticChunker', () => {
  test('splits at ## headings', () => {
    // chunkSize=5 so minThreshold=0.5 tokens — segments won't be merged
    const chunker = new SemanticChunker({ chunkSize: 5, overlapPercent: 0 });
    const doc = {
      id: 'doc1',
      text: '## Introduction\nThis is the intro.\n## Conclusion\nThis is the conclusion.',
    };

    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.text.includes('Introduction'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('Conclusion'))).toBe(true);
  });

  test('splits at double newlines', () => {
    // chunkSize=20: each segment (~8 tokens) fits without sub-chunking,
    // and minThreshold=2 tokens is well below 8, so segments won't be merged
    const chunker = new SemanticChunker({ chunkSize: 20, overlapPercent: 0 });
    const doc = {
      id: 'doc1',
      text: 'First paragraph content here.\n\nSecond paragraph content here.',
    };

    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('First paragraph');
    expect(chunks[1].text).toContain('Second paragraph');
  });

  test('delegates to TextChunker when a segment exceeds chunkSize', () => {
    const chunker = new SemanticChunker({ chunkSize: 5, overlapPercent: 0 });
    // Single segment with many words — must be sub-chunked
    const longSegment = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const doc = { id: 'doc1', text: longSegment };

    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('merges sub-threshold segments with the next segment', () => {
    // chunkSize=100, minThreshold=10 tokens (~40 chars)
    // "Hi" is well below threshold, should merge with next segment
    const chunker = new SemanticChunker({ chunkSize: 100, overlapPercent: 0 });
    const doc = {
      id: 'doc1',
      // "Hi" is tiny (< 10 tokens), should be merged with the following paragraph
      text: 'Hi\n\nThis is a longer paragraph with enough content to stand on its own.',
    };

    const chunks = chunker.chunk(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Hi');
    expect(chunks[0].text).toContain('longer paragraph');
  });

  test('copies document metadata onto each chunk', () => {
    const chunker = new SemanticChunker({ chunkSize: 400 });
    const doc = {
      id: 'doc1',
      text: 'First paragraph.\n\nSecond paragraph.',
      metadata: { author: 'alice' },
    };

    const chunks = chunker.chunk(doc);
    for (const chunk of chunks) {
      expect(chunk.metadata).toEqual({ author: 'alice' });
    }
  });
});
