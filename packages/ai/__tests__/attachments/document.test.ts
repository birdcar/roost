import { describe, it, expect, afterEach } from 'bun:test';
import { Document, setStorageResolver } from '../../src/attachments/index.js';

describe('Files.Document constructors', () => {
  afterEach(() => setStorageResolver(null));

  it('fromString defaults mime to the provided type and is lazy', async () => {
    const doc = Document.fromString('# Hello', 'text/markdown', { name: 'intro.md' });
    expect(doc.name()).toBe('intro.md');
    expect(doc.mimeType()).toBe('text/markdown');
    const bytes = await doc.bytes();
    expect(new TextDecoder().decode(bytes)).toBe('# Hello');
  });

  it('fromStorage falls through to registered resolver and records mime override', async () => {
    setStorageResolver({
      async get() {
        return { bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' };
      },
    });
    const doc = Document.fromStorage('reports/q4.pdf');
    expect(await doc.size()).toBe(3);
    expect(doc.mimeType()).toBe('application/pdf');
  });

  it('fromUpload uses the Blob mime when no override is given', async () => {
    const blob = new Blob(['PDFBYTES'], { type: 'application/pdf' });
    const doc = Document.fromUpload(blob, { name: 'upload.pdf' });
    expect(doc.mimeType()).toBe('application/pdf');
    expect(await doc.size()).toBe(8);
  });

  it('fromId surfaces the provider file id', () => {
    const doc = Document.fromId('file_42', { provider: 'anthropic' });
    expect(doc.providerFileId()).toBe('file_42');
    expect(doc.providerLab()).toBe('anthropic');
  });

  it('withPages stores an explicit page count', () => {
    const doc = Document.fromString('x', 'application/pdf').withPages(12);
    expect(doc.pages()).toBe(12);
  });
});
