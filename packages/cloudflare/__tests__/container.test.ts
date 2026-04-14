import { describe, test, expect, mock } from 'bun:test';
import { ContainerClient } from '../src/bindings/container';

function createMockStub(response: Response = new Response('ok')) {
  const fetchFn = mock(() => Promise.resolve(response));
  return { fetch: fetchFn } as unknown as DurableObjectStub;
}

function createMockNamespace(stub?: DurableObjectStub) {
  const fakeId = {} as DurableObjectId;
  const resolvedStub = stub ?? createMockStub();
  const idFromNameFn = mock(() => fakeId);
  const getFn = mock(() => resolvedStub);

  const namespace = {
    idFromName: idFromNameFn,
    idFromString: mock(() => fakeId),
    newUniqueId: mock(() => fakeId),
    get: getFn,
  } as unknown as DurableObjectNamespace;

  return { namespace, idFromNameFn, getFn, stub: resolvedStub };
}

describe('ContainerClient', () => {
  test('raw getter returns the underlying DurableObjectNamespace', () => {
    const { namespace } = createMockNamespace();
    const client = new ContainerClient(namespace);
    expect(client.raw).toBe(namespace);
  });

  test('getStub() returns a DurableObjectStub for the named container', () => {
    const stub = createMockStub();
    const { namespace, idFromNameFn, getFn } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    const result = client.getStub('my-container');

    expect(idFromNameFn).toHaveBeenCalledWith('my-container');
    expect(getFn).toHaveBeenCalled();
    expect(result).toBe(stub);
  });

  test('send() sends a request to the container DO with the correct path', async () => {
    const stub = createMockStub();
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    await client.send('my-container', '/run');

    expect((stub as any).fetch).toHaveBeenCalledWith(
      'http://container/run',
      expect.any(Object),
    );
  });

  test('send() uses GET method by default', async () => {
    const stub = createMockStub();
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    await client.send('my-container', '/status');

    expect((stub as any).fetch).toHaveBeenCalledWith(
      'http://container/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('send() passes custom method, headers, and body', async () => {
    const stub = createMockStub();
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    await client.send('my-container', '/process', {
      method: 'POST',
      headers: { 'X-Job-Id': 'job-42' },
      body: '{"task":"run"}',
    });

    expect((stub as any).fetch).toHaveBeenCalledWith(
      'http://container/process',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Job-Id': 'job-42' },
        body: '{"task":"run"}',
      }),
    );
  });

  test('warmup() sends GET /health and returns true on 200', async () => {
    const stub = createMockStub(new Response('healthy', { status: 200 }));
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    const result = await client.warmup('my-container');

    expect(result).toBe(true);
    expect((stub as any).fetch).toHaveBeenCalledWith(
      'http://container/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('warmup() returns false when the health check fails', async () => {
    const stub = createMockStub(new Response('error', { status: 503 }));
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    const result = await client.warmup('my-container');

    expect(result).toBe(false);
  });

  test('warmup() returns false when the stub throws (cold start timeout)', async () => {
    const stub = { fetch: mock(() => Promise.reject(new Error('DO unavailable'))) } as unknown as DurableObjectStub;
    const { namespace } = createMockNamespace(stub);
    const client = new ContainerClient(namespace);

    const result = await client.warmup('my-container');

    expect(result).toBe(false);
  });
});
