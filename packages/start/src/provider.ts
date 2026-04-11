import { ServiceProvider } from '@roost/core';

export class StartServiceProvider extends ServiceProvider {
  register(): void {
    // Phase 2 has no services to register beyond what the middleware sets up.
    // This provider exists so Phase 3 (auth) and Phase 4 (ORM) have a stable
    // registration point alongside the start integration.
  }
}
