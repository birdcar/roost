import { describe, test, expect } from 'bun:test';
import { Pipeline } from '../src/middleware';
import type { Middleware } from '../src/types';

function makeRequest(path = '/'): Request {
  return new Request(`http://localhost${path}`);
}

describe('Pipeline', () => {
  test('executes middleware in order', async () => {
    const order: number[] = [];

    const mw1: Middleware = {
      async handle(req, next) {
        order.push(1);
        const res = await next(req);
        order.push(4);
        return res;
      },
    };

    const mw2: Middleware = {
      async handle(req, next) {
        order.push(2);
        const res = await next(req);
        order.push(3);
        return res;
      },
    };

    const pipeline = new Pipeline().use(mw1).use(mw2);

    await pipeline.handle(makeRequest(), async () => new Response('ok'));

    expect(order).toEqual([1, 2, 3, 4]);
  });

  test('middleware can short-circuit without calling next', async () => {
    const reached: string[] = [];

    const blocker: Middleware = {
      async handle(_req, _next) {
        reached.push('blocker');
        return new Response('blocked', { status: 403 });
      },
    };

    const after: Middleware = {
      async handle(req, next) {
        reached.push('after');
        return next(req);
      },
    };

    const pipeline = new Pipeline().use(blocker).use(after);

    const response = await pipeline.handle(makeRequest(), async () => new Response('ok'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('blocked');
    expect(reached).toEqual(['blocker']);
  });

  test('middleware receives parameters via args', async () => {
    let receivedArgs: string[] = [];

    const mw: Middleware = {
      async handle(req, next, ...args) {
        receivedArgs = args;
        return next(req);
      },
    };

    const pipeline = new Pipeline().use(mw, 'admin', 'editor');

    await pipeline.handle(makeRequest(), async () => new Response('ok'));

    expect(receivedArgs).toEqual(['admin', 'editor']);
  });

  test('middleware can transform the response', async () => {
    const addHeader: Middleware = {
      async handle(req, next) {
        const response = await next(req);
        const modified = new Response(response.body, response);
        modified.headers.set('x-custom', 'added');
        return modified;
      },
    };

    const pipeline = new Pipeline().use(addHeader);

    const response = await pipeline.handle(makeRequest(), async () => new Response('ok'));

    expect(response.headers.get('x-custom')).toBe('added');
  });

  test('empty pipeline passes through to destination', async () => {
    const pipeline = new Pipeline();
    const response = await pipeline.handle(makeRequest(), async () => new Response('destination'));

    expect(await response.text()).toBe('destination');
  });
});
