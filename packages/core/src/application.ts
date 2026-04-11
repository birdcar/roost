import { RoostContainer } from './container.js';
import { ConfigManager } from './config.js';
import { Pipeline } from './middleware.js';
import { ServiceProvider } from './provider.js';
import type { Container, Handler, Middleware, MiddlewareClass, ServiceProviderClass } from './types.js';

export class Application {
  readonly container: Container;
  readonly config: ConfigManager;
  readonly env: Record<string, unknown>;

  private providers: ServiceProvider[] = [];
  private globalMiddleware: Array<{ middleware: Middleware | MiddlewareClass; args: string[] }> = [];
  private _booted = false;
  private dispatcher?: Handler;

  get isBooted(): boolean {
    return this._booted;
  }

  constructor(env: Record<string, unknown>, config?: Record<string, unknown>) {
    this.env = env;
    this.container = new RoostContainer();
    this.config = new ConfigManager(config);

    this.container.singleton(Application as any, () => this);
  }

  static create(env: Record<string, unknown>, config?: Record<string, unknown>): Application {
    return new Application(env, config);
  }

  register(Provider: ServiceProviderClass): this {
    const provider = new Provider(this);
    this.providers.push(provider);
    return this;
  }

  useMiddleware(middleware: Middleware | MiddlewareClass, ...args: string[]): this {
    this.globalMiddleware.push({ middleware, args });
    return this;
  }

  onDispatch(handler: Handler): this {
    this.dispatcher = handler;
    return this;
  }

  async boot(): Promise<void> {
    if (this._booted) return;

    for (const provider of this.providers) {
      await provider.register();
    }

    for (const provider of this.providers) {
      if (provider.boot) {
        await provider.boot();
      }
    }

    this._booted = true;
  }

  async handle(request: Request): Promise<Response> {
    if (!this._booted) {
      await this.boot();
    }

    const scoped = this.container.scoped();
    const pipeline = new Pipeline().withContainer(scoped);

    for (const { middleware, args } of this.globalMiddleware) {
      pipeline.use(middleware, ...args);
    }

    const destination = this.dispatcher ?? defaultDispatcher;
    return pipeline.handle(request, destination);
  }
}

const defaultDispatcher: Handler = async () => {
  return new Response('Not Found', { status: 404 });
};
