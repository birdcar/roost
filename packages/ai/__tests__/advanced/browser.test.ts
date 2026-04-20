import { describe, it, expect } from 'bun:test';
import { Browser, BrowserNavigationError } from '../../src/browser/index.js';
import type { BrowserDriver, BrowserPage } from '../../src/browser/index.js';
import { createToolRequest } from '../../src/tool.js';

function makePage(url: string, textBody: string): BrowserPage {
  let closed = false;
  return {
    url,
    async html() {
      return `<html><body>${textBody}</body></html>`;
    },
    async text() {
      return textBody;
    },
    async screenshot() {
      return new Uint8Array();
    },
    async pdf() {
      return new Uint8Array();
    },
    async click() {
      if (closed) throw new Error('page closed');
    },
    async fill() {
      if (closed) throw new Error('page closed');
    },
    async close() {
      closed = true;
    },
  };
}

describe('Browser.navigate', () => {
  it('returns a BrowserPage from the configured driver', async () => {
    const driver: BrowserDriver = {
      async navigate(url) {
        return makePage(url, 'hello world');
      },
    };
    Browser.configure(driver);
    const page = await Browser.navigate('https://example.com');
    expect(await page.text()).toBe('hello world');
  });

  it('wraps driver errors in BrowserNavigationError', async () => {
    const driver: BrowserDriver = {
      async navigate() {
        throw new Error('dns failure');
      },
    };
    Browser.configure(driver);
    await expect(Browser.navigate('https://bad.example')).rejects.toThrow(BrowserNavigationError);
  });
});

describe('Browser.asTool', () => {
  it('exposes a Tool that fetches url and returns text', async () => {
    const driver: BrowserDriver = {
      async navigate(url) {
        return makePage(url, `rendered:${url}`);
      },
    };
    Browser.configure(driver);
    const tool = Browser.asTool();
    const result = await tool.handle(createToolRequest({ url: 'https://example.com' }));
    expect(result).toBe('rendered:https://example.com');
  });

  it('enforces maxPages limit', async () => {
    const driver: BrowserDriver = {
      async navigate(url) {
        return makePage(url, 'x');
      },
    };
    Browser.configure(driver);
    const tool = Browser.asTool({ maxPages: 0 });
    await expect(tool.handle(createToolRequest({ url: 'https://x' }))).rejects.toThrow(BrowserNavigationError);
  });
});
