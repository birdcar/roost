import { ServiceProvider } from '@roostjs/core';
import { DurableObjectClient } from '@roostjs/cloudflare';
import { BroadcastManager } from './manager.js';

export class BroadcastServiceProvider extends ServiceProvider {
  protected bindingName(): string {
    return 'BROADCAST_DO';
  }

  register(): void {
    const namespace = this.app.env[this.bindingName()] as DurableObjectNamespace;
    if (!namespace) {
      throw new Error(
        `BroadcastServiceProvider: binding "${this.bindingName()}" not found in env. ` +
        `Add a Durable Object binding named "${this.bindingName()}" to wrangler.jsonc.`
      );
    }

    const doClient = new DurableObjectClient(namespace);
    const manager = new BroadcastManager(doClient);
    BroadcastManager.set(manager);

    this.app.container.singleton('broadcast.manager', () => manager);
  }
}
