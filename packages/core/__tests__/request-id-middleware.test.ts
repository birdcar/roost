import { describe, test, expect } from 'bun:test';
import { RequestIdMiddleware } from '../src/middleware/request-id';
import { Logger } from '../src/logger';
import { RoostContainer } from '../src/container';

function makeRequest(path = '/', headers: Record<string, string> = {}): Request {
  const req = new Request(`http://localhost${path}`, { headers });
  const container = new RoostContainer();
  (req as any).__roostContainer = container;
  return req;
}

const middleware = new RequestIdMiddleware();

describe('RequestIdMiddleware', () => {
  test('adds X-Request-Id header to response', async () => {
    const request = makeRequest();
    const response = await middleware.handle(request, async () => new Response('ok'));

    expect(response.headers.get('X-Request-Id')).toBeDefined();
    expect(response.headers.get('X-Request-Id')!.length).toBeGreaterThan(0);
  });

  test('uses cf-ray header as request ID when present', async () => {
    const request = makeRequest('/', { 'cf-ray': 'ray-abc123' });
    const response = await middleware.handle(request, async () => new Response('ok'));

    expect(response.headers.get('X-Request-Id')).toBe('ray-abc123');
  });

  test('generates a UUID when cf-ray is absent', async () => {
    const request = makeRequest();
    const response = await middleware.handle(request, async () => new Response('ok'));

    const id = response.headers.get('X-Request-Id')!;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('registers Logger in the scoped container', async () => {
    const request = makeRequest();
    let resolvedLogger: Logger | undefined;

    await middleware.handle(request, async (req) => {
      resolvedLogger = (req as any).__roostContainer.resolve(Logger);
      return new Response('ok');
    });

    expect(resolvedLogger).toBeInstanceOf(Logger);
  });

  test('calls next and returns its response body', async () => {
    const request = makeRequest();
    const response = await middleware.handle(request, async () => new Response('hello world'));

    expect(await response.text()).toBe('hello world');
  });

  test('preserves response status from next handler', async () => {
    const request = makeRequest();
    const response = await middleware.handle(
      request,
      async () => new Response('not found', { status: 404 })
    );

    expect(response.status).toBe(404);
  });
});
