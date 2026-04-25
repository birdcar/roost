import { createServerFn } from '@tanstack/react-start';
import type { Application, Container } from '@roostjs/core';
import type { RoostServerContext } from './types.js';
import { createRoostMiddleware } from './middleware.js';

type Middleware = any;
type Validator<TInput> = (input: TInput) => TInput;
type Resolve = Container['resolve'];

export interface RoostHandlerContext {
  roost: RoostServerContext;
  app: Application;
  resolve: Resolve;
}

export type RoostFnHandler<TOutput> = (
  context: RoostHandlerContext
) => Promise<TOutput>;

export type RoostFnWithInputHandler<TInput, TOutput> = (
  context: RoostHandlerContext & { input: TInput }
) => Promise<TOutput>;

export interface RoostFnOptions<TInput> {
  input: Validator<TInput>;
  method?: 'GET' | 'POST';
}

export interface SerializableRouteArgs {
  params?: unknown;
  search?: unknown;
  context?: unknown;
  deps?: unknown;
  loaderDeps?: unknown;
  location?: {
    href?: string;
    pathname?: string;
    search?: string;
  };
}

export type RoostRouteHandler<TArgs extends SerializableRouteArgs, TOutput> = (
  context: RoostHandlerContext & TArgs
) => Promise<TOutput>;

function createHandlerContext(roost: RoostServerContext): RoostHandlerContext {
  return {
    roost,
    app: roost.app,
    resolve: roost.container.resolve.bind(roost.container),
  };
}

function pickSerializableRouteArgs(args: any): SerializableRouteArgs {
  const location = args?.location;

  return {
    params: args?.params,
    search: args?.search,
    context: args?.context,
    deps: args?.deps,
    loaderDeps: args?.loaderDeps,
    location: location
      ? {
          href: location.href,
          pathname: location.pathname,
          search: location.search,
        }
      : undefined,
  };
}

/**
 * Creates a TanStack Start server function with Roost context pre-injected
 * and no input data. The function body receives the RoostServerContext,
 * giving access to the scoped service container and Application.
 *
 * @example
 * ```typescript
 * export const listUsers = roostFn(roostMiddleware, async (roost) => {
 *   const users = roost.container.resolve(UserService);
 *   return users.findAll();
 * });
 * ```
 */
export function roostFn<TOutput>(
  middleware: any,
  fn: (roost: RoostServerContext) => Promise<TOutput>
) {
  return createServerFn({ method: 'GET' })
    .middleware([middleware])
    .handler(async ({ context }: any): Promise<any> => {
      return fn(context.roost);
    });
}

/**
 * Creates a TanStack Start server function with Roost context pre-injected
 * and typed input data via a validator function.
 *
 * @example
 * ```typescript
 * export const getUser = roostFnWithInput(
 *   roostMiddleware,
 *   (d: { userId: string }) => d,
 *   async (roost, input) => {
 *     const users = roost.container.resolve(UserService);
 *     return users.findById(input.userId);
 *   }
 * );
 * ```
 */
export function roostFnWithInput<TInput, TOutput>(
  middleware: any,
  validator: (input: TInput) => TInput,
  fn: (roost: RoostServerContext, input: TInput) => Promise<TOutput>
) {
  return createServerFn({ method: 'POST' })
    .middleware([middleware])
    .inputValidator(validator as any)
    .handler(async ({ context, data }: any): Promise<any> => {
      return fn(context.roost, data);
    });
}

export interface BoundRoostStart {
  middleware: Middleware;
  fn: {
    <TOutput>(handler: RoostFnHandler<TOutput>): any;
    <TInput, TOutput>(
      options: RoostFnOptions<TInput>,
      handler: RoostFnWithInputHandler<TInput, TOutput>
    ): any;
  };
  loader: <TArgs extends SerializableRouteArgs, TOutput>(
    handler: RoostRouteHandler<TArgs, TOutput>
  ) => (args: TArgs) => Promise<TOutput>;
  beforeLoad: <TArgs extends SerializableRouteArgs, TOutput>(
    handler: RoostRouteHandler<TArgs, TOutput>
  ) => (args: TArgs) => Promise<TOutput>;
}

/**
 * Bind a Roost application factory once and return TanStack Start helpers
 * with request-scoped Roost context pre-injected.
 */
export function createRoostStart(options: {
  app: () => Application;
}): BoundRoostStart {
  const middleware = createRoostMiddleware(options.app);

  return {
    middleware,
    fn: createRoostServerFn(middleware),
    loader: createRoostLoader(middleware),
    beforeLoad: createRoostBeforeLoad(middleware),
  };
}

/**
 * Create a bound Roost server function helper. Input is optional so apps only
 * need one configured `fn` helper for server functions.
 */
export function createRoostServerFn(middleware: Middleware): BoundRoostStart['fn'] {
  function fn<TOutput>(handler: RoostFnHandler<TOutput>): any;
  function fn<TInput, TOutput>(
    options: RoostFnOptions<TInput>,
    handler: RoostFnWithInputHandler<TInput, TOutput>
  ): any;
  function fn<TInput, TOutput>(
    optionsOrHandler: RoostFnOptions<TInput> | RoostFnHandler<TOutput>,
    maybeHandler?: RoostFnWithInputHandler<TInput, TOutput>
  ) {
    if (typeof optionsOrHandler === 'function') {
      return createServerFn({ method: 'GET' })
        .middleware([middleware])
        .handler(async ({ context }: any): Promise<any> => {
          return optionsOrHandler(createHandlerContext(context.roost));
        });
    }

    return createServerFn({ method: optionsOrHandler.method ?? 'POST' })
      .middleware([middleware])
      .inputValidator(optionsOrHandler.input as any)
      .handler(async ({ context, data }: any): Promise<any> => {
        return maybeHandler?.({
          ...createHandlerContext(context.roost),
          input: data,
        });
      });
  }

  return fn;
}

/**
 * Create a Roost-aware TanStack route loader helper.
 */
export function createRoostLoader(middleware: Middleware) {
  return function roostLoader<TArgs extends SerializableRouteArgs, TOutput>(
    handler: RoostRouteHandler<TArgs, TOutput>
  ) {
    const run = createServerFn({ method: 'POST' })
      .middleware([middleware])
      .inputValidator(((input: unknown) => input) as any)
      .handler(async ({ context, data }: any): Promise<any> => {
        return handler({
          ...data,
          ...createHandlerContext(context.roost),
        });
      });

    return async (args: TArgs): Promise<TOutput> => {
      return (run as any)({ data: pickSerializableRouteArgs(args) });
    };
  };
}

/**
 * Create a Roost-aware TanStack beforeLoad helper.
 */
export function createRoostBeforeLoad(middleware: Middleware) {
  return function roostBeforeLoad<TArgs extends SerializableRouteArgs, TOutput>(
    handler: RoostRouteHandler<TArgs, TOutput>
  ) {
    const run = createServerFn({ method: 'POST' })
      .middleware([middleware])
      .inputValidator(((input: unknown) => input) as any)
      .handler(async ({ context, data }: any): Promise<any> => {
        return handler({
          ...data,
          ...createHandlerContext(context.roost),
        });
      });

    return async (args: TArgs): Promise<TOutput> => {
      return (run as any)({ data: pickSerializableRouteArgs(args) });
    };
  };
}
