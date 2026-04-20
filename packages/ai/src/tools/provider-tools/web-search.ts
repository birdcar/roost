import { Lab } from '../../enums.js';
import { UnsupportedProviderToolError } from '../../tool.js';

export interface WebSearchLocation {
  city?: string;
  region?: string;
  country?: string;
}

export class WebSearch {
  readonly kind = 'provider' as const;
  readonly name = 'web_search' as const;

  private _max?: number;
  private _allow?: string[];
  private _location?: WebSearchLocation;

  max(n: number): this {
    this._max = n;
    return this;
  }

  allow(domains: string[]): this {
    this._allow = [...domains];
    return this;
  }

  location(opts: WebSearchLocation): this {
    this._location = { ...opts };
    return this;
  }

  toRequest(provider: Lab | string): Record<string, unknown> {
    switch (provider) {
      case Lab.Anthropic:
        return {
          type: 'web_search_20250305',
          name: 'web_search',
          ...(this._max !== undefined ? { max_uses: this._max } : {}),
          ...(this._allow ? { allowed_domains: this._allow } : {}),
          ...(this._location ? { user_location: { type: 'approximate', ...this._location } } : {}),
        };
      case Lab.OpenAI:
        return {
          type: 'web_search',
          ...(this._max !== undefined ? { max_results: this._max } : {}),
          ...(this._allow ? { allowed_domains: this._allow } : {}),
          ...(this._location ? { user_location: this._location } : {}),
        };
      case Lab.Gemini:
        return {
          google_search: {},
          ...(this._max !== undefined ? { grounding_config: { max_results: this._max } } : {}),
        };
      default:
        throw new UnsupportedProviderToolError('web_search', provider);
    }
  }
}
