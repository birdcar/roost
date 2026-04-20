import { Lab } from '../../enums.js';
import { UnsupportedProviderToolError } from '../../tool.js';

export class WebFetch {
  readonly kind = 'provider' as const;
  readonly name = 'web_fetch' as const;

  private _max?: number;
  private _allow?: string[];

  max(n: number): this {
    this._max = n;
    return this;
  }

  allow(domains: string[]): this {
    this._allow = [...domains];
    return this;
  }

  toRequest(provider: Lab | string): Record<string, unknown> {
    switch (provider) {
      case Lab.Anthropic:
        return {
          type: 'web_fetch_20250910',
          name: 'web_fetch',
          ...(this._max !== undefined ? { max_uses: this._max } : {}),
          ...(this._allow ? { allowed_domains: this._allow } : {}),
        };
      case Lab.Gemini:
        return {
          url_context: {},
          ...(this._max !== undefined ? { grounding_config: { max_results: this._max } } : {}),
        };
      default:
        throw new UnsupportedProviderToolError('web_fetch', provider);
    }
  }
}
