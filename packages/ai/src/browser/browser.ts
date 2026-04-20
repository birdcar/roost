import type { Tool, ToolRequest } from '../tool.js';
import { schema as schemaBuilder, type SchemaBuilder } from '@roostjs/schema';

export interface BrowserOptions {
  waitFor?: string;
  timeoutMs?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface BrowserPage {
  readonly url: string;
  html(): Promise<string>;
  text(): Promise<string>;
  screenshot(): Promise<Uint8Array>;
  pdf(): Promise<Uint8Array>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  close(): Promise<void>;
}

export class BrowserNavigationError extends Error {
  override readonly name = 'BrowserNavigationError';
  constructor(url: string, cause: unknown) {
    super(`Failed to navigate to '${url}': ${(cause as Error).message ?? String(cause)}`);
  }
}

/**
 * Driver-level browser abstraction. In production this wraps CF Browser
 * Rendering; unit tests inject a stub driver.
 */
export interface BrowserDriver {
  navigate(url: string, opts?: BrowserOptions): Promise<BrowserPage>;
}

class BrowserService {
  private driver?: BrowserDriver;
  private pagesOpened = 0;

  configure(driver: BrowserDriver): void {
    this.driver = driver;
  }

  async navigate(url: string, opts?: BrowserOptions): Promise<BrowserPage> {
    if (!this.driver) throw new BrowserNavigationError(url, new Error('No driver configured'));
    try {
      const page = await this.driver.navigate(url, opts);
      this.pagesOpened++;
      return page;
    } catch (err) {
      throw new BrowserNavigationError(url, err);
    }
  }

  get opened(): number {
    return this.pagesOpened;
  }

  asTool(opts: { maxPages?: number } = {}): Tool {
    const service = this;
    const maxPages = opts.maxPages ?? 25;
    return {
      name() {
        return 'browser';
      },
      description() {
        return 'Navigate to a URL and return the rendered text content.';
      },
      schema(s: typeof schemaBuilder): Record<string, SchemaBuilder> {
        return { url: s.string(), waitFor: s.string() };
      },
      async handle(request: ToolRequest): Promise<string> {
        if (service.opened >= maxPages) {
          throw new BrowserNavigationError(
            request.get<string>('url'),
            new Error(`Exceeded maxPages limit (${maxPages})`),
          );
        }
        const url = request.get<string>('url');
        const waitFor = request.get<string | undefined>('waitFor');
        const page = await service.navigate(url, { waitFor });
        try {
          return await page.text();
        } finally {
          await page.close();
        }
      },
    };
  }
}

export const Browser = new BrowserService();
