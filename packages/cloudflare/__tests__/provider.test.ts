import { describe, test, expect } from 'bun:test';
import { ServiceClient } from '../src/bindings/service';
import { DispatchNamespaceClient } from '../src/bindings/dispatch';
import { CloudflareServiceProvider } from '../src/provider';

function makeProvider(env: Record<string, unknown>) {
  const bindings = new Map<string, unknown>();
  const app = {
    env,
    container: {
      singleton(key: string, factory: () => unknown) {
        bindings.set(key, factory());
      },
    },
  } as any;
  const provider = new CloudflareServiceProvider(app);
  provider.register();
  return bindings;
}

const fakeFetcher = {
  fetch: () => Promise.resolve(new Response('ok')),
};

const fakeDispatchNamespace = {
  get: () => fakeFetcher,
};

const fakeKV = {
  get: () => Promise.resolve(null),
  put: () => Promise.resolve(),
  delete: () => Promise.resolve(),
  list: () => Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null }),
};

const fakeQueue = {
  send: () => Promise.resolve(),
  sendBatch: () => Promise.resolve(),
};

const fakeDONamespace = {
  idFromName: () => ({}),
  idFromString: () => ({}),
  newUniqueId: () => ({}),
  get: () => ({ fetch: () => Promise.resolve(new Response('ok')) }),
};

describe('CloudflareServiceProvider — Phase 7 guards', () => {
  describe('isFetcher / ServiceClient registration', () => {
    test('registers ServiceClient for a Fetcher binding (service binding)', () => {
      const bindings = makeProvider({ AUTH_SERVICE: fakeFetcher });
      expect(bindings.get('AUTH_SERVICE')).toBeInstanceOf(ServiceClient);
    });

    test('does not register ServiceClient for a KV binding (has get)', () => {
      const bindings = makeProvider({ MY_KV: fakeKV });
      expect(bindings.get('MY_KV')).not.toBeInstanceOf(ServiceClient);
    });

    test('does not register ServiceClient for a Queue binding (has send)', () => {
      const bindings = makeProvider({ MY_QUEUE: fakeQueue });
      expect(bindings.get('MY_QUEUE')).not.toBeInstanceOf(ServiceClient);
    });

    test('does not register ServiceClient for a DO namespace (has idFromName)', () => {
      const bindings = makeProvider({ MY_DO: fakeDONamespace });
      expect(bindings.get('MY_DO')).not.toBeInstanceOf(ServiceClient);
    });
  });

  describe('isDispatchNamespace / DispatchNamespaceClient registration', () => {
    test('registers DispatchNamespaceClient for a dispatch namespace binding', () => {
      const bindings = makeProvider({ DISPATCH: fakeDispatchNamespace });
      expect(bindings.get('DISPATCH')).toBeInstanceOf(DispatchNamespaceClient);
    });

    test('does not register DispatchNamespaceClient for a KV binding (has put)', () => {
      const bindings = makeProvider({ MY_KV: fakeKV });
      expect(bindings.get('MY_KV')).not.toBeInstanceOf(DispatchNamespaceClient);
    });

    test('does not register DispatchNamespaceClient for a DO namespace (has idFromName)', () => {
      const bindings = makeProvider({ MY_DO: fakeDONamespace });
      expect(bindings.get('MY_DO')).not.toBeInstanceOf(DispatchNamespaceClient);
    });
  });

  describe('existing bindings unaffected by Phase 7 guards', () => {
    test('KV binding still detected correctly', () => {
      const { KVStore } = require('../src/bindings/kv');
      const bindings = makeProvider({ MY_KV: fakeKV });
      expect(bindings.get('MY_KV')).toBeInstanceOf(KVStore);
    });

    test('Queue binding still detected correctly', () => {
      const { QueueSender } = require('../src/bindings/queues');
      const bindings = makeProvider({ MY_QUEUE: fakeQueue });
      expect(bindings.get('MY_QUEUE')).toBeInstanceOf(QueueSender);
    });

    test('Fetcher not confused with DispatchNamespace', () => {
      const bindings = makeProvider({ SVC: fakeFetcher, NS: fakeDispatchNamespace });
      expect(bindings.get('SVC')).toBeInstanceOf(ServiceClient);
      expect(bindings.get('NS')).toBeInstanceOf(DispatchNamespaceClient);
    });
  });
});
