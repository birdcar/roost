import type { McpRequest } from './types.js';

export function createMcpRequest(params: Record<string, unknown>, uri?: string): McpRequest {
  return {
    params,
    get<T>(key: string): T {
      return params[key] as T;
    },
    all(): Record<string, unknown> {
      return { ...params };
    },
    uri: uri ? () => uri : undefined,
  };
}
