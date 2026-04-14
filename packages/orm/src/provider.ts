import { ServiceProvider } from '@roost/core';
import { D1Database } from '@roost/cloudflare';
import { ModelRegistry } from './registry.js';
import { TenantContext } from './tenant-context.js';
import { TenantDatabaseResolver } from './tenant-resolver.js';
import { D1SessionHandle } from './d1-session.js';

export class OrmServiceProvider extends ServiceProvider {
  private modelClasses: Array<typeof import('./model.js').Model> = [];

  withModels(models: Array<typeof import('./model.js').Model>): this {
    this.modelClasses = models;
    return this;
  }

  register(): void {
    this.app.container.singleton(ModelRegistry, () => {
      const registry = new ModelRegistry();
      for (const modelClass of this.modelClasses) {
        registry.register(modelClass);
      }
      return registry;
    });

    this.app.container.bind(TenantContext, () => new TenantContext());
  }

  async boot(): Promise<void> {
    const registry = this.app.container.resolve(ModelRegistry);
    const strategy = this.app.config.get('database.tenantStrategy', 'row') as string;
    const useSession = this.app.config.get('database.useSession', false) as boolean;
    const d1BindingName = this.app.config.get('database.d1Binding', 'DB') as string;

    let rawD1: globalThis.D1Database;

    if (strategy === 'database') {
      const tenantCtx = this.app.container.resolve(TenantContext);
      const orgSlug = tenantCtx.get()?.orgSlug ?? null;

      if (orgSlug) {
        const pattern = this.app.config.get('database.tenantBindingPattern', 'DB_TENANT_{SLUG}') as string;
        const resolver = new TenantDatabaseResolver(pattern, (name) => {
          try {
            return this.app.container.resolve<D1Database>(name).raw;
          } catch {
            return null;
          }
        });
        const tenantRaw = resolver.resolve(orgSlug);
        if (!tenantRaw) {
          console.warn(
            `[OrmServiceProvider] No per-tenant D1 binding found for org "${orgSlug}"; falling back to shared DB.`
          );
        }
        rawD1 = tenantRaw ?? this.app.container.resolve<D1Database>(d1BindingName).raw;
      } else {
        rawD1 = this.app.container.resolve<D1Database>(d1BindingName).raw;
      }
    } else {
      rawD1 = this.app.container.resolve<D1Database>(d1BindingName).raw;
    }

    if (useSession) {
      const sessionHandle = new D1SessionHandle(rawD1);
      registry.boot(sessionHandle.sessionAwareRaw());
    } else {
      registry.boot(rawD1);
    }

    // Inject TenantContext into all registered model classes
    const ctx = this.app.container.resolve(TenantContext);
    for (const [, modelClass] of registry.getModels()) {
      (modelClass as any)._tenantContext = ctx;
    }
  }
}
