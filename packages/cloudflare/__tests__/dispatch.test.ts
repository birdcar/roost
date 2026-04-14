import { describe, test, expect, mock } from 'bun:test';
import { DispatchNamespaceClient } from '../src/bindings/dispatch';
import { ServiceClient } from '../src/bindings/service';

function createMockFetcher() {
  return { fetch: mock(() => Promise.resolve(new Response('ok'))) } as unknown as Fetcher;
}

function createMockNamespace(fetcher: Fetcher = createMockFetcher()) {
  const getFn = mock(() => fetcher);
  const namespace = { get: getFn } as unknown as DispatchNamespace;
  return { namespace, getFn, fetcher };
}

describe('DispatchNamespaceClient', () => {
  test('raw getter returns the underlying DispatchNamespace', () => {
    const { namespace } = createMockNamespace();
    const client = new DispatchNamespaceClient(namespace);
    expect(client.raw).toBe(namespace);
  });

  test('dispatch() calls namespace.get() with the script name', () => {
    const { namespace, getFn } = createMockNamespace();
    const client = new DispatchNamespaceClient(namespace);

    client.dispatch('tenant-abc');

    expect(getFn).toHaveBeenCalledWith('tenant-abc', expect.any(Object));
  });

  test('dispatch() passes outbound args when provided', () => {
    const { namespace, getFn } = createMockNamespace();
    const client = new DispatchNamespaceClient(namespace);

    client.dispatch('tenant-abc', { outboundArgs: ['cust-1', 'key-xyz'] });

    expect(getFn).toHaveBeenCalledWith(
      'tenant-abc',
      expect.objectContaining({ outbound: { args: ['cust-1', 'key-xyz'] } }),
    );
  });

  test('dispatch() omits outbound config when outboundArgs is absent', () => {
    const { namespace, getFn } = createMockNamespace();
    const client = new DispatchNamespaceClient(namespace);

    client.dispatch('tenant-abc');

    expect(getFn).toHaveBeenCalledWith(
      'tenant-abc',
      expect.objectContaining({ outbound: undefined }),
    );
  });

  test('trust mode is untrusted by default (no trust option passed through)', () => {
    const { namespace, getFn } = createMockNamespace();
    const client = new DispatchNamespaceClient(namespace);

    client.dispatch('tenant-abc');

    const callArg = getFn.mock.calls[0][1] as Record<string, unknown>;
    expect('trust' in callArg).toBe(false);
  });

  test('dispatchClient() returns a ServiceClient wrapping the dispatched Fetcher', () => {
    const fetcher = createMockFetcher();
    const { namespace } = createMockNamespace(fetcher);
    const client = new DispatchNamespaceClient(namespace);

    const serviceClient = client.dispatchClient('tenant-abc');

    expect(serviceClient).toBeInstanceOf(ServiceClient);
    expect(serviceClient.raw).toBe(fetcher);
  });
});
