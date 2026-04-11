import type { Middleware, MiddlewareClass, Handler, Container } from './types.js';

interface MiddlewareEntry {
  middleware: Middleware | MiddlewareClass;
  args: string[];
}

export class Pipeline {
  private entries: MiddlewareEntry[] = [];
  private container?: Container;

  withContainer(container: Container): this {
    this.container = container;
    return this;
  }

  use(middleware: Middleware | MiddlewareClass, ...args: string[]): this {
    this.entries.push({ middleware, args });
    return this;
  }

  async handle(request: Request, destination: Handler): Promise<Response> {
    const runner = this.buildRunner(destination, 0);
    return runner(request);
  }

  private buildRunner(destination: Handler, index: number): (request: Request) => Promise<Response> {
    if (index >= this.entries.length) return destination;

    const entry = this.entries[index];
    const next = this.buildRunner(destination, index + 1);

    return async (request: Request) => {
      const instance = this.resolveMiddleware(entry.middleware);
      return instance.handle(request, next, ...entry.args);
    };
  }

  private resolveMiddleware(middleware: Middleware | MiddlewareClass): Middleware {
    if (typeof middleware === 'function') {
      if (this.container?.has(middleware as any)) {
        return this.container.resolve<Middleware>(middleware as any);
      }
      return new (middleware as MiddlewareClass)();
    }
    return middleware;
  }
}
