import type { ProviderRequest, ProviderResponse } from '../types.js';

export interface AIProvider {
  name: string;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(request: ProviderRequest): AsyncIterable<string>;
}
