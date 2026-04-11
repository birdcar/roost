import { describe, test, expect } from 'bun:test';
import { TestClient, TestResponse } from '../src/client';
import { Application } from '@roost/core';

function createTestApp(handler: (req: Request) => Response | Promise<Response>): Application {
  const app = Application.create({});
  app.onDispatch(async (req) => handler(req));
  return app;
}

describe('TestClient', () => {
  test('GET request returns TestResponse', async () => {
    const app = createTestApp(() => new Response('hello'));
    const client = new TestClient(app);

    const response = await client.get('/');
    response.assertOk();
    expect(await response.text()).toBe('hello');
  });

  test('POST with JSON body', async () => {
    const app = createTestApp(async (req) => {
      const body = await req.json();
      return Response.json(body);
    });
    const client = new TestClient(app);

    const response = await client.post('/users', { name: 'Alice' });
    response.assertOk();
    const data = await response.json<{ name: string }>();
    expect(data.name).toBe('Alice');
  });

  test('actingAs sets auth header', async () => {
    const app = createTestApp((req) => {
      const userId = req.headers.get('x-test-user-id');
      return Response.json({ userId });
    });
    const client = new TestClient(app);

    const response = await client.actingAs({ id: 'user_123' }).get('/me');
    const data = await response.json<{ userId: string }>();
    expect(data.userId).toBe('user_123');
  });

  test('withHeaders adds custom headers', async () => {
    const app = createTestApp((req) => {
      return Response.json({ token: req.headers.get('authorization') });
    });
    const client = new TestClient(app);

    const response = await client.withHeaders({ authorization: 'Bearer token123' }).get('/api');
    const data = await response.json<{ token: string }>();
    expect(data.token).toBe('Bearer token123');
  });

  test('PUT request works', async () => {
    const app = createTestApp(async (req) => {
      expect(req.method).toBe('PUT');
      return new Response('updated');
    });
    const client = new TestClient(app);
    const response = await client.put('/resource/1', { name: 'updated' });
    response.assertOk();
  });

  test('DELETE request works', async () => {
    const app = createTestApp((req) => {
      expect(req.method).toBe('DELETE');
      return new Response(null, { status: 204 });
    });
    const client = new TestClient(app);
    const response = await client.delete('/resource/1');
    response.assertNoContent();
  });
});

describe('TestResponse', () => {
  test('assertStatus passes on match', () => {
    const response = new TestResponse(new Response('ok', { status: 200 }));
    response.assertStatus(200);
  });

  test('assertStatus throws on mismatch', () => {
    const response = new TestResponse(new Response('nope', { status: 404 }));
    expect(() => response.assertStatus(200)).toThrow('Expected status 200, got 404');
  });

  test('assertRedirect passes on 302', () => {
    const response = new TestResponse(new Response(null, {
      status: 302,
      headers: { location: '/login' },
    }));
    response.assertRedirect('/login');
  });

  test('assertRedirect throws on wrong location', () => {
    const response = new TestResponse(new Response(null, {
      status: 302,
      headers: { location: '/dashboard' },
    }));
    expect(() => response.assertRedirect('/login')).toThrow('Expected redirect to "/login"');
  });

  test('assertHeader passes when header present', () => {
    const response = new TestResponse(new Response('ok', {
      headers: { 'x-custom': 'value' },
    }));
    response.assertHeader('x-custom', 'value');
  });

  test('assertHeader throws when header missing', () => {
    const response = new TestResponse(new Response('ok'));
    expect(() => response.assertHeader('x-missing')).toThrow('Expected header "x-missing"');
  });

  test('assertJson checks key values', async () => {
    const response = new TestResponse(Response.json({ name: 'Alice', age: 30 }));
    await response.assertJson({ name: 'Alice' });
  });

  test('assertForbidden checks 403', () => {
    const response = new TestResponse(new Response('Forbidden', { status: 403 }));
    response.assertForbidden();
  });

  test('assertNotFound checks 404', () => {
    const response = new TestResponse(new Response('Not Found', { status: 404 }));
    response.assertNotFound();
  });

  test('assertUnauthorized checks 401', () => {
    const response = new TestResponse(new Response('Unauthorized', { status: 401 }));
    response.assertUnauthorized();
  });

  test('assertions are chainable', () => {
    const response = new TestResponse(new Response('ok', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));
    response.assertOk().assertHeader('content-type', 'text/plain');
  });
});
