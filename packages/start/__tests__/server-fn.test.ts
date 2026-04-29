import { describe, expect, mock, test } from 'bun:test';
import type { RoostServerContext } from '../src/types';

let fakeRoost: RoostServerContext;
let createdServerFns: Array<{
  method: string;
  middleware: any[];
  validator?: (input: unknown) => unknown;
}> = [];

mock.module('@tanstack/react-start', () => {
  function createServerFn(options: { method?: string } = {}) {
    const state = {
      method: options.method ?? 'GET',
      middleware: [] as any[],
      validator: undefined as undefined | ((input: unknown) => unknown),
    };

    const builder = {
      middleware(middleware: any[]) {
        state.middleware.push(...middleware);
        return builder;
      },
      inputValidator(validator: (input: unknown) => unknown) {
        state.validator = validator;
        return builder;
      },
      handler(handler: (ctx: any) => Promise<unknown>) {
        createdServerFns.push(state);

        return async (opts?: { data?: unknown }) => {
          const data = state.validator ? state.validator(opts?.data) : opts?.data;

          return handler({
            context: { roost: fakeRoost },
            data,
          });
        };
      },
    };

    return builder;
  }

  function createMiddleware() {
    return {
      server(handler: any) {
        return { options: { server: handler } };
      },
    };
  }

  return {
    createServerFn,
    createMiddleware,
  };
});

const {
  createRoostBeforeLoad,
  createRoostLoader,
  createRoostServerFn,
  createRoostStart,
} = await import('../src/server-fn');

function makeFakeRoost() {
  const resolved = new Map<unknown, unknown>();
  const container = {
    resolve: mock((token: unknown) => {
      if (!resolved.has(token)) {
        resolved.set(token, { token });
      }

      return resolved.get(token);
    }),
  };

  const roost = {
    app: { name: 'fake-app' } as any,
    container: container as any,
  };

  return { container, roost };
}

function resetFakeRoost() {
  const { container, roost } = makeFakeRoost();

  fakeRoost = roost;
  createdServerFns = [];

  return { container };
}

describe('Roost server function helpers', () => {
  test('createRoostServerFn creates a no-input server function with Roost context', async () => {
    const { container } = resetFakeRoost();
    const middleware = { name: 'middleware' };
    const fn = createRoostServerFn(middleware);
    const Token = class Token {};

    const serverFn = fn(async ({ app, resolve, roost }) => {
      return {
        app,
        roost,
        resolved: resolve(Token),
      };
    });

    const result = await serverFn();

    expect(createdServerFns[0]?.method).toBe('GET');
    expect(createdServerFns[0]?.middleware).toEqual([middleware]);
    expect(container.resolve).toHaveBeenCalledWith(Token);
    expect(result.app).toBe(fakeRoost.app);
    expect(result.roost).toBe(fakeRoost);
    expect(result.resolved).toEqual({ token: Token });
  });

  test('createRoostServerFn supports validated input', async () => {
    resetFakeRoost();
    const fn = createRoostServerFn({});

    const serverFn = fn(
      {
        input: (raw: { id: string }) => ({ id: raw.id.toUpperCase() }),
      },
      async ({ input }) => input.id
    );

    await expect(serverFn({ data: { id: 'abc' } })).resolves.toBe('ABC');
    expect(createdServerFns[0]?.method).toBe('POST');
  });

  test('createRoostLoader passes curated route args and Roost context', async () => {
    const { container } = resetFakeRoost();
    const middleware = { name: 'middleware' };
    const loader = createRoostLoader(middleware);
    const Token = Symbol('token');

    const load = loader(async (ctx) => {
      const { params, search, location, context, resolve } = ctx;

      return {
        params,
        search,
        location,
        context,
        resolved: resolve(Token),
        hasSignal: 'signal' in ctx,
      };
    });

    const result = await load({
      params: { postId: '123' },
      search: { q: 'roost' },
      location: {
        href: '/posts/123?q=roost',
        pathname: '/posts/123',
        search: '?q=roost',
        state: { shouldNotPass: true },
      } as any,
      context: { orgId: 'org_123' },
      signal: new AbortController().signal,
    } as any);

    expect(createdServerFns[0]?.method).toBe('POST');
    expect(createdServerFns[0]?.middleware).toEqual([middleware]);
    expect(container.resolve).toHaveBeenCalledWith(Token);
    expect(result).toEqual({
      params: { postId: '123' },
      search: { q: 'roost' },
      location: {
        href: '/posts/123?q=roost',
        pathname: '/posts/123',
        search: '?q=roost',
      },
      context: { orgId: 'org_123' },
      resolved: { token: Token },
      hasSignal: false,
    });
  });

  test('createRoostLoader uses the current request-scoped container for each call', async () => {
    const first = resetFakeRoost();
    const loader = createRoostLoader({});
    const Token = Symbol('token');

    const load = loader(async ({ resolve }) => {
      return resolve(Token);
    });

    const firstResult = await load({});
    const second = makeFakeRoost();
    fakeRoost = second.roost;
    const secondResult = await load({});

    expect(first.container.resolve).toHaveBeenCalledWith(Token);
    expect(second.container.resolve).toHaveBeenCalledWith(Token);
    expect(firstResult).not.toBe(secondResult);
  });

  test('createRoostLoader calls the server function boundary before the handler', async () => {
    resetFakeRoost();
    const handler = mock(async () => 'loaded');
    const load = createRoostLoader({})(handler);

    expect(handler).not.toHaveBeenCalled();
    await expect(load({ params: { postId: '123' } })).resolves.toBe('loaded');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('createRoostBeforeLoad returns route context from the server handler', async () => {
    resetFakeRoost();
    const beforeLoad = createRoostBeforeLoad({});

    const guard = beforeLoad(async ({ location }) => {
      return {
        userId: 'user_123',
        href: location?.href,
      };
    });

    await expect(
      guard({ location: { href: '/dashboard', pathname: '/dashboard' } })
    ).resolves.toEqual({
      userId: 'user_123',
      href: '/dashboard',
    });
  });

  test('createRoostBeforeLoad preserves thrown redirects and loader preserves not-found errors', async () => {
    resetFakeRoost();
    const redirectError = Object.assign(new Error('redirect'), {
      isRedirect: true,
    });
    const notFoundError = Object.assign(new Error('not found'), {
      isNotFound: true,
    });

    const guard = createRoostBeforeLoad({})(async () => {
      throw redirectError;
    });
    const load = createRoostLoader({})(async () => {
      throw notFoundError;
    });

    await expect(guard({})).rejects.toBe(redirectError);
    await expect(load({})).rejects.toBe(notFoundError);
  });

  test('createRoostStart returns bound helpers', () => {
    resetFakeRoost();

    const start = createRoostStart({
      app: () => fakeRoost.app,
    });

    expect(start.middleware).toBeDefined();
    expect(typeof start.fn).toBe('function');
    expect(typeof start.loader).toBe('function');
    expect(typeof start.beforeLoad).toBe('function');
  });
});
