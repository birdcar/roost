import { describe, it, expect } from 'bun:test';
import { WebSearch } from '../../src/tools/provider-tools/index.js';
import { UnsupportedProviderToolError } from '../../src/tool.js';
import { Lab } from '../../src/enums.js';

describe('WebSearch provider tool', () => {
  it('carries max/allow/location into the Anthropic request shape', () => {
    const ws = new WebSearch().max(5).allow(['example.com']).location({ country: 'US' });
    const body = ws.toRequest(Lab.Anthropic);
    expect(body).toMatchObject({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
      allowed_domains: ['example.com'],
      user_location: { type: 'approximate', country: 'US' },
    });
  });

  it('emits an OpenAI-shaped request with max_results and allowed_domains', () => {
    const body = new WebSearch().max(3).allow(['docs.example.com']).toRequest(Lab.OpenAI);
    expect(body).toMatchObject({
      type: 'web_search',
      max_results: 3,
      allowed_domains: ['docs.example.com'],
    });
  });

  it('emits google_search grounding for Gemini', () => {
    const body = new WebSearch().max(7).toRequest(Lab.Gemini);
    expect(body).toMatchObject({
      google_search: {},
      grounding_config: { max_results: 7 },
    });
  });

  it('throws UnsupportedProviderToolError for Workers AI', () => {
    expect(() => new WebSearch().toRequest(Lab.WorkersAI)).toThrow(UnsupportedProviderToolError);
  });

  it('is a ProviderTool with kind=provider and name=web_search', () => {
    const ws = new WebSearch();
    expect(ws.kind).toBe('provider');
    expect(ws.name).toBe('web_search');
  });

  it('emits no max/allow fields when not configured', () => {
    const body = new WebSearch().toRequest(Lab.Anthropic);
    expect('max_uses' in body).toBe(false);
    expect('allowed_domains' in body).toBe(false);
  });
});
