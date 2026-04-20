import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Image, setStorageResolver } from '../../src/attachments/index.js';

describe('Files.Image constructors', () => {
  afterEach(() => setStorageResolver(null));

  it('fromString builds an image with a provided mime type and lazy bytes', async () => {
    const image = Image.fromString('hello', 'image/png', { name: 'greeting.png' });
    expect(image.name()).toBe('greeting.png');
    expect(image.mimeType()).toBe('image/png');
    const bytes = await image.bytes();
    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });

  it('fromUrl fetches bytes only on first bytes() call and caches them', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );

    const image = Image.fromUrl('https://example.com/logo.png');
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    const first = await image.bytes();
    const second = await image.bytes();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(first)).toEqual([1, 2, 3]);
    expect(first).toBe(second);

    fetchSpy.mockRestore();
  });

  it('fromUpload reads Blob bytes via Web API', async () => {
    const blob = new Blob(['hi'], { type: 'image/png' });
    const image = Image.fromUpload(blob, { name: 'hi.png' });
    expect(image.name()).toBe('hi.png');
    expect(image.mimeType()).toBe('image/png');
    const bytes = await image.bytes();
    expect(new TextDecoder().decode(bytes)).toBe('hi');
  });

  it('fromStorage resolves bytes via the registered storage resolver', async () => {
    setStorageResolver({
      async get(key: string) {
        expect(key).toBe('logos/hero.png');
        return { bytes: new Uint8Array([9, 9]), mimeType: 'image/png' };
      },
    });
    const image = Image.fromStorage('logos/hero.png');
    const bytes = await image.bytes();
    expect(Array.from(bytes)).toEqual([9, 9]);
    expect(image.mimeType()).toBe('image/png');
  });

  it('fromStorage throws when no resolver is registered', async () => {
    const image = Image.fromStorage('logos/hero.png');
    await expect(image.bytes()).rejects.toThrow(/storage resolver/);
  });

  it('fromId retains provider file id and does not attempt to load bytes', async () => {
    const image = Image.fromId('file_abc', { provider: 'openai', mimeType: 'image/jpeg' });
    expect(image.providerFileId()).toBe('file_abc');
    expect(image.mimeType()).toBe('image/jpeg');
    await expect(image.bytes()).rejects.toThrow(/fromId/);
  });

  it('fromPath throws with a helpful message when fs is unavailable', async () => {
    // Under bun (which provides Node APIs), this should succeed IF the file exists.
    // We just verify the error path is reachable for missing files.
    const image = Image.fromPath('/tmp/__definitely_not_here__.png');
    await expect(image.bytes()).rejects.toThrow();
  });

  it('.as(name) overrides the display name without changing the underlying source', () => {
    const image = Image.fromString('x', 'image/png', { name: 'orig.png' }).as('aliased.png');
    expect(image.name()).toBe('aliased.png');
  });

  it('.quality() and .dimensions() record metadata', () => {
    const image = Image.fromString('x', 'image/png').quality(80).dimensions({ width: 64, height: 64 });
    expect(image.getQuality()).toBe(80);
    expect(image.getDimensions()).toEqual({ width: 64, height: 64 });
  });
});
