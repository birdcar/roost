import { ServiceProvider } from '@roost/core';
import { D1Database } from '@roost/cloudflare';
import { ModelRegistry } from './registry.js';

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
  }

  async boot(): Promise<void> {
    const registry = this.app.container.resolve(ModelRegistry);
    const d1BindingName = this.app.config.get('database.d1Binding', 'DB');
    const d1Wrapper = this.app.container.resolve<D1Database>(d1BindingName);

    registry.boot(d1Wrapper.raw);
  }
}
