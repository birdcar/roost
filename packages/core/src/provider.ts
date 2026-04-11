import type { Application } from './application.js';

export abstract class ServiceProvider {
  constructor(protected app: Application) {}

  abstract register(): void | Promise<void>;

  boot?(): void | Promise<void>;
}
