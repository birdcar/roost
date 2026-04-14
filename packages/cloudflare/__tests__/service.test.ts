import { describe, test, expect, mock } from 'bun:test';
import { ServiceClient, ServiceCallError } from '../src/bindings/service';

function createMockFetcher(response: Response = new Response('ok')) {
  const fetchFn = mock(() => Promise.resolve(response));
  const fetcher = { fetch: fetchFn } as unknown as Fetcher;
  return { fetcher, fetchFn };
}

describe('ServiceClient', () => {
  test('raw getter returns the underlying Fetcher', () => {
    const { fetcher } = createMockFetcher();
    const client = new ServiceClient(fetcher);
    expect(client.raw).toBe(fetcher);
  });

  test('fetch() delegates to the underlying Fetcher', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.fetch('http://service/ping', { method: 'GET' });

    expect(fetchFn).toHaveBeenCalledWith('http://service/ping', { method: 'GET' });
  });

  test('get() sends a GET request to the correct URL', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.get('/users');

    expect(fetchFn).toHaveBeenCalledWith('http://service/users', expect.objectContaining({ method: 'GET' }));
  });

  test('post() sends a POST request with JSON body and Content-Type header', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.post('/users', { name: 'Alice' });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://service/users',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: 'Alice' }),
      }),
    );
  });

  test('put() sends a PUT request with JSON body', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.put('/users/1', { name: 'Bob' });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://service/users/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Bob' }),
      }),
    );
  });

  test('patch() sends a PATCH request with JSON body', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.patch('/users/1', { name: 'Carol' });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://service/users/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Carol' }),
      }),
    );
  });

  test('delete() sends a DELETE request', async () => {
    const { fetcher, fetchFn } = createMockFetcher();
    const client = new ServiceClient(fetcher);

    await client.delete('/users/1');

    expect(fetchFn).toHaveBeenCalledWith('http://service/users/1', expect.objectContaining({ method: 'DELETE' }));
  });

  test('call() posts to /rpc/<method> with serialized args', async () => {
    const { fetcher, fetchFn } = createMockFetcher(
      new Response(JSON.stringify({ result: true }), { status: 200 }),
    );
    const client = new ServiceClient(fetcher);

    await client.call('verifyToken', 'abc123', { userId: 42 });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://service/rpc/verifyToken',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: ['abc123', { userId: 42 }] }),
      }),
    );
  });

  test('call() returns parsed JSON response body', async () => {
    const { fetcher } = createMockFetcher(
      new Response(JSON.stringify({ valid: true, userId: 99 }), { status: 200 }),
    );
    const client = new ServiceClient(fetcher);

    const result = await client.call<{ valid: boolean; userId: number }>('verify', 'token');

    expect(result).toEqual({ valid: true, userId: 99 });
  });

  test('call() throws ServiceCallError when response is not ok', async () => {
    const { fetcher } = createMockFetcher(new Response('Unauthorized', { status: 401 }));
    const client = new ServiceClient(fetcher);

    await expect(client.call('verify', 'bad-token')).rejects.toBeInstanceOf(ServiceCallError);
  });

  test('ServiceCallError includes method name, status, and body', async () => {
    const { fetcher } = createMockFetcher(new Response('Not Found', { status: 404 }));
    const client = new ServiceClient(fetcher);

    let caught: ServiceCallError | undefined;
    try {
      await client.call('lookup', 'missing-id');
    } catch (err) {
      caught = err as ServiceCallError;
    }

    expect(caught).toBeInstanceOf(ServiceCallError);
    expect(caught?.method).toBe('lookup');
    expect(caught?.status).toBe(404);
    expect(caught?.body).toBe('Not Found');
  });
});
