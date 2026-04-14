import { ServiceProvider } from '@roostjs/core';
import { KVStore } from '@roostjs/cloudflare';
import { RoostWorkOSClient, WorkOSClientToken } from './workos-client.js';
import { KVSessionStore } from './session/store.js';
import { SessionManager } from './session/manager.js';
import { OrgResolver } from './org.js';

export class AuthServiceProvider extends ServiceProvider {
  register(): void {
    const env = this.app.env as Record<string, string | undefined>;

    const apiKey = env.WORKOS_API_KEY;
    const clientId = env.WORKOS_CLIENT_ID;

    if (!apiKey || !clientId) {
      throw new Error(
        'Missing WORKOS_API_KEY or WORKOS_CLIENT_ID environment variables. ' +
        'Set them in wrangler.toml [vars] or .dev.vars for local development.'
      );
    }

    this.app.container.singleton(WorkOSClientToken, () => new RoostWorkOSClient(apiKey));

    this.app.container.singleton(KVSessionStore, (c) => {
      const kvBindingName = this.app.config.get('auth.session.kvBinding', 'SESSION_KV');
      const kv = c.resolve<KVStore>(kvBindingName);
      return new KVSessionStore(kv);
    });

    this.app.container.singleton(SessionManager, (c) => {
      const workos = c.resolve(WorkOSClientToken) as RoostWorkOSClient;
      const store = c.resolve(KVSessionStore);
      return new SessionManager(store, workos, clientId);
    });

    this.app.container.singleton(OrgResolver, () => {
      const strategies = this.app.config.get('auth.org.strategies', ['subdomain', 'path-prefix', 'header']);
      return new OrgResolver(strategies as any);
    });
  }
}
