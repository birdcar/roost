import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Files } from '../../src/rag/files/files.js';
import { Image, Document } from '../../src/attachments/index.js';
import {
  resetFilesAdapters,
  registerFilesAdapter,
  OpenAIFilesAdapter,
  R2NativeFilesAdapter,
  type FilesAdapter,
} from '../../src/rag/files/storage-providers.js';

describe('Files namespace backward-compat', () => {
  it('still exposes .Image and .Document classes from P4', () => {
    expect(Files.Image).toBe(Image);
    expect(Files.Document).toBe(Document);
  });
});

describe('Files.fake()', () => {
  afterEach(() => Files.restore());

  it('store() records the file and returns a synthetic record', async () => {
    const fake = Files.fake();
    const img = Image.fromString('hi', 'image/png', { name: 'hi.png' });
    const record = await Files.store(img);
    expect(record.id).toMatch(/^fake_file_/);
    expect(record.name).toBe('hi.png');
    expect(record.mimeType).toBe('image/png');
    expect(fake.stored).toHaveLength(1);
  });

  it('assertStored passes when a file matches the predicate', async () => {
    Files.fake();
    await Files.store(Image.fromString('x', 'image/png', { name: 'x.png' }));
    expect(() => Files.assertStored((f) => f.name() === 'x.png')).not.toThrow();
    expect(() => Files.assertStored((f) => f.name() === 'nope.png')).toThrow();
  });

  it('assertNothingStored throws after a store()', async () => {
    Files.fake();
    await Files.store(Document.fromString('doc', 'application/pdf'));
    expect(() => Files.assertNothingStored()).toThrow();
  });

  it('assertDeleted passes after delete()', async () => {
    Files.fake();
    const record = await Files.store(Image.fromString('x', 'image/png'));
    await Files.delete(record.id);
    expect(() => Files.assertDeleted(record.id)).not.toThrow();
    expect(() => Files.assertDeleted('missing')).toThrow();
  });

  it('get() returns the record by id', async () => {
    Files.fake();
    const record = await Files.store(Image.fromString('x', 'image/png'));
    const fetched = await Files.get(record.id);
    expect(fetched.id).toBe(record.id);
  });
});

describe('Files adapter routing', () => {
  beforeEach(() => resetFilesAdapters());
  afterEach(() => {
    Files.restore();
    resetFilesAdapters();
  });

  it('routes store() to the registered OpenAI adapter via fetch', async () => {
    const adapter = new OpenAIFilesAdapter('test-key');
    registerFilesAdapter('openai', adapter);
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 'file_abc', filename: 'x.png', bytes: 2, created_at: 1_700_000_000 }),
        { status: 200 },
      ),
    );
    const record = await Files.store(Image.fromString('hi', 'image/png', { name: 'x.png' }), {
      provider: 'openai',
    });
    expect(record.id).toBe('file_abc');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/files');
    expect((init as RequestInit).method).toBe('POST');
    fetchSpy.mockRestore();
  });

  it('throws a helpful error when no adapter is registered', async () => {
    await expect(
      Files.store(Image.fromString('x', 'image/png'), { provider: 'openai' }),
    ).rejects.toThrow(/No FilesAdapter/);
  });

  it('R2NativeFilesAdapter stores bytes under a files/{uuid} key', async () => {
    const puts: Array<{ key: string; bytes: Uint8Array }> = [];
    const bucket: R2Bucket = {
      async put(key: string, value: Uint8Array) {
        puts.push({ key, bytes: value });
        return { size: value.byteLength } as unknown as R2Object;
      },
    } as unknown as R2Bucket;
    const adapter = new R2NativeFilesAdapter(bucket);
    const record = await adapter.store(Image.fromString('hello', 'image/png'));
    expect(record.id.startsWith('files/')).toBe(true);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.bytes.byteLength).toBe(5);
  });
});
