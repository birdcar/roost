export type ServiceFetchOptions = Omit<RequestInit, 'method'>;

export class ServiceClient {
  constructor(private fetcher: Fetcher) {}

  get raw(): Fetcher {
    return this.fetcher;
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.fetcher.fetch(url, init);
  }

  async get(path: string, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, { ...options, method: 'GET' });
  }

  async post(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body?: unknown, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string, options?: ServiceFetchOptions): Promise<Response> {
    return this.fetcher.fetch(`http://service${path}`, { ...options, method: 'DELETE' });
  }

  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const response = await this.fetcher.fetch(`http://service/rpc/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    if (!response.ok) {
      throw new ServiceCallError(method, response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }
}

export class ServiceCallError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`Service RPC "${method}" failed with status ${status}: ${body}`);
    this.name = 'ServiceCallError';
  }
}
