import { McpResource } from '../resource.js';
import { McpResponse } from '../response.js';
import type { McpRequest } from '../types.js';

export interface AiSearchQuery {
  query: string;
  metadataFilters?: Record<string, string>;
  pathFilters?: string[];
}

export interface AiSearchResult {
  answer: string;
  sources: Array<{
    url: string;
    title?: string;
    excerpt?: string;
  }>;
}

/**
 * MCP resource wrapping a Cloudflare AI Search binding.
 *
 * Because `AiSearchResource` requires constructor arguments (binding + instance
 * name), it cannot be used in the `Array<new () => McpResource>` pattern
 * directly. Two registration patterns are supported:
 *
 * **Pattern 1 — Subclass per instance (recommended for `McpServer.resources`):**
 * ```typescript
 * class MyAiSearch extends AiSearchResource {
 *   constructor() {
 *     super(env.AI_SEARCH, 'my-docs');
 *   }
 * }
 *
 * class MyMcpServer extends McpServer {
 *   resources = [MyAiSearch];
 * }
 * ```
 *
 * **Pattern 2 — Ad-hoc via `McpServer.readResource()`:**
 * ```typescript
 * const resource = new AiSearchResource(env.AI_SEARCH, 'my-docs');
 * // Pass the resource instance directly rather than registering on the server.
 * ```
 */
export class AiSearchResource extends McpResource {
  constructor(
    private binding: { run(request: Record<string, unknown>): Promise<Record<string, unknown>> },
    private instanceName: string,
  ) {
    super();
  }

  uri(): string {
    return `aisearch://${this.instanceName}`;
  }

  mimeType(): string {
    return 'application/json';
  }

  description(): string {
    return `AI Search instance "${this.instanceName}". Query with { query, metadataFilters?, pathFilters? }.`;
  }

  shouldRegister(): boolean {
    return true;
  }

  async handle(request: McpRequest): Promise<McpResponse> {
    const query = request.get<string>('query');

    if (!query || query.trim() === '') {
      return McpResponse.error('query is required');
    }

    const metadataFilters = request.get<Record<string, string> | undefined>('metadataFilters');
    const pathFilters = request.get<string[] | undefined>('pathFilters');

    const searchRequest: Record<string, unknown> = {
      query,
      ...(metadataFilters ? { metadata_filters: metadataFilters } : {}),
      ...(pathFilters?.length ? { path_filters: pathFilters } : {}),
    };

    try {
      const response = await this.binding.run(searchRequest);

      if ('answer' in response) {
        return McpResponse.structured({
          answer: response['answer'],
          sources: response['sources'] ?? [],
        });
      }

      return McpResponse.structured(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return McpResponse.error(message);
    }
  }
}
