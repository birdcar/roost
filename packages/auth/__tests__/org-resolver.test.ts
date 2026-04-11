import { describe, test, expect } from 'bun:test';
import { OrgResolver } from '../src/org';

describe('OrgResolver', () => {
  test('resolves from subdomain', () => {
    const resolver = new OrgResolver(['subdomain']);
    const req = new Request('https://acme.app.example.com/dashboard');
    const result = resolver.resolve(req);
    expect(result).toEqual({ slug: 'acme' });
  });

  test('ignores www subdomain', () => {
    const resolver = new OrgResolver(['subdomain']);
    const req = new Request('https://www.example.com/');
    expect(resolver.resolve(req)).toBeNull();
  });

  test('ignores api subdomain', () => {
    const resolver = new OrgResolver(['subdomain']);
    const req = new Request('https://api.example.com/');
    expect(resolver.resolve(req)).toBeNull();
  });

  test('resolves from path prefix', () => {
    const resolver = new OrgResolver(['path-prefix']);
    const req = new Request('https://example.com/org/acme/dashboard');
    const result = resolver.resolve(req);
    expect(result).toEqual({ slug: 'acme' });
  });

  test('resolves from X-Org-Slug header', () => {
    const resolver = new OrgResolver(['header']);
    const req = new Request('https://example.com/', {
      headers: { 'X-Org-Slug': 'acme' },
    });
    const result = resolver.resolve(req);
    expect(result).toEqual({ slug: 'acme' });
  });

  test('tries strategies in order and returns first match', () => {
    const resolver = new OrgResolver(['subdomain', 'path-prefix', 'header']);
    const req = new Request('https://acme.app.example.com/org/other/dashboard', {
      headers: { 'X-Org-Slug': 'third' },
    });
    const result = resolver.resolve(req);
    expect(result).toEqual({ slug: 'acme' });
  });

  test('returns null when no strategy matches', () => {
    const resolver = new OrgResolver(['subdomain', 'path-prefix', 'header']);
    const req = new Request('https://example.com/dashboard');
    expect(resolver.resolve(req)).toBeNull();
  });
});
