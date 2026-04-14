import type { Application } from '@roostjs/core';

export class TestResponse {
  constructor(private response: Response) {}

  get status(): number { return this.response.status; }
  get headers(): Headers { return this.response.headers; }

  assertStatus(expected: number): this {
    if (this.response.status !== expected) {
      throw new Error(`Expected status ${expected}, got ${this.response.status}`);
    }
    return this;
  }

  assertOk(): this { return this.assertStatus(200); }
  assertCreated(): this { return this.assertStatus(201); }
  assertNoContent(): this { return this.assertStatus(204); }
  assertNotFound(): this { return this.assertStatus(404); }
  assertForbidden(): this { return this.assertStatus(403); }
  assertUnauthorized(): this { return this.assertStatus(401); }

  assertRedirect(to?: string): this {
    if (this.response.status < 300 || this.response.status >= 400) {
      throw new Error(`Expected redirect status (3xx), got ${this.response.status}`);
    }
    if (to) {
      const location = this.response.headers.get('location');
      if (location !== to) {
        throw new Error(`Expected redirect to "${to}", got "${location}"`);
      }
    }
    return this;
  }

  assertHeader(name: string, value?: string): this {
    const actual = this.response.headers.get(name);
    if (actual === null) {
      throw new Error(`Expected header "${name}" to be present`);
    }
    if (value !== undefined && actual !== value) {
      throw new Error(`Expected header "${name}" to be "${value}", got "${actual}"`);
    }
    return this;
  }

  async json<T = unknown>(): Promise<T> {
    return this.response.json() as Promise<T>;
  }

  async text(): Promise<string> {
    return this.response.text();
  }

  async assertJson(expected: Record<string, unknown>): Promise<this> {
    const data = await this.response.clone().json();
    for (const [key, value] of Object.entries(expected)) {
      if ((data as Record<string, unknown>)[key] !== value) {
        throw new Error(
          `Expected JSON key "${key}" to be ${JSON.stringify(value)}, got ${JSON.stringify((data as Record<string, unknown>)[key])}`
        );
      }
    }
    return this;
  }
}

export class TestClient {
  private app: Application;
  private defaultHeaders: Record<string, string> = {};
  private authUserId?: string;

  constructor(app: Application) {
    this.app = app;
  }

  actingAs(user: { id: string }): this {
    this.authUserId = user.id;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    Object.assign(this.defaultHeaders, headers);
    return this;
  }

  async get(path: string): Promise<TestResponse> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('POST', path, body);
  }

  async put(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('PUT', path, body);
  }

  async patch(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('PATCH', path, body);
  }

  async delete(path: string): Promise<TestResponse> {
    return this.request('DELETE', path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<TestResponse> {
    const url = new URL(path, 'http://localhost');
    const headers = new Headers(this.defaultHeaders);

    if (this.authUserId) {
      headers.set('x-test-user-id', this.authUserId);
    }

    if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }

    const request = new Request(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const response = await this.app.handle(request);
    return new TestResponse(response);
  }
}
