import type { Application } from './application.js';

export type Token<T = unknown> = (abstract new (...args: any[]) => T) | string | symbol;

export type Factory<T> = (container: Container) => T;

export interface Container {
  bind<T>(token: Token<T>, factory: Factory<T>): void;
  singleton<T>(token: Token<T>, factory: Factory<T>): void;
  resolve<T>(token: Token<T>): T;
  scoped(): Container;
  has(token: Token): boolean;
}

export interface Middleware {
  handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[]
  ): Promise<Response>;
}

export type MiddlewareClass = new (...args: any[]) => Middleware;

export type Handler = (request: Request) => Promise<Response>;

export type ServiceProviderClass = new (app: Application) => import('./provider.js').ServiceProvider;

export type { LogLevel, LogContext, LogEntry } from './logger.js';
