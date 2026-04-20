import { describe, it, expect } from 'bun:test';
import { WebFetch } from '../../src/tools/provider-tools/index.js';
import { UnsupportedProviderToolError } from '../../src/tool.js';
import { Lab } from '../../src/enums.js';

describe('WebFetch provider tool', () => {
  it('emits Anthropic web_fetch request with max_uses and allowed_domains', () => {
    const body = new WebFetch().max(2).allow(['example.com']).toRequest(Lab.Anthropic);
    expect(body).toMatchObject({
      type: 'web_fetch_20250910',
      name: 'web_fetch',
      max_uses: 2,
      allowed_domains: ['example.com'],
    });
  });

  it('emits Gemini url_context grounding', () => {
    const body = new WebFetch().max(4).toRequest(Lab.Gemini);
    expect(body).toMatchObject({
      url_context: {},
      grounding_config: { max_results: 4 },
    });
  });

  it('throws UnsupportedProviderToolError for OpenAI and Workers AI', () => {
    expect(() => new WebFetch().toRequest(Lab.OpenAI)).toThrow(UnsupportedProviderToolError);
    expect(() => new WebFetch().toRequest(Lab.WorkersAI)).toThrow(UnsupportedProviderToolError);
  });
});
