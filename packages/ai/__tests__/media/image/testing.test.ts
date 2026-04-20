import { describe, it, expect, afterEach } from 'bun:test';
import { Image } from '../../../src/media/image';

describe('Image testing surface', () => {
  afterEach(() => {
    Image.restore();
  });

  it('assertGenerated matches on the ImagePrompt predicate', async () => {
    Image.fake();
    await Image.of('forest glade').landscape().generate();
    expect(() => Image.assertGenerated((p) => p.isLandscape())).not.toThrow();
    expect(() => Image.assertGenerated((p) => p.isSquare())).toThrow();
  });

  it('assertNotGenerated with a predicate fails if any prompt matches', async () => {
    Image.fake();
    await Image.of('cat').generate();
    expect(() => Image.assertNotGenerated((p) => p.contains('cat'))).toThrow();
    expect(() => Image.assertNotGenerated((p) => p.contains('dog'))).not.toThrow();
  });

  it('fake() returns a trivial PNG when no resolver is provided', async () => {
    Image.fake();
    const response = await Image.of('default').generate();
    expect(response.bytes.byteLength).toBeGreaterThan(0);
    expect(response.mimeType()).toBe('image/png');
  });

  it('preventStrayImages throws when no resolver matches', async () => {
    Image.fake();
    Image.preventStrayImages();
    await expect(Image.of('unknown').generate()).rejects.toThrow();
  });

  it('restore() clears fake state so new fake starts fresh', async () => {
    Image.fake();
    await Image.of('first').generate();
    Image.restore();
    Image.fake();
    expect(() => Image.assertNothingGenerated()).not.toThrow();
  });
});
