import { describe, test, expect } from 'bun:test';
import { CsrfMiddleware } from '../src/middleware/csrf';

const destination = async () => new Response('ok');

describe('CsrfMiddleware', () => {
  const csrf = new CsrfMiddleware();

  test('GET request passes through and sets CSRF cookie', async () => {
    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await csrf.handle(request, destination);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).toContain('roost_csrf=');
  });

  test('GET request does not set cookie if one already exists', async () => {
    const request = new Request('http://localhost/', {
      method: 'GET',
      headers: { cookie: 'roost_csrf=existing-token' },
    });
    const response = await csrf.handle(request, destination);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).toBeNull();
  });

  test('POST request with matching tokens passes through', async () => {
    const token = 'valid-token-123';
    const request = new Request('http://localhost/api/resource', {
      method: 'POST',
      headers: {
        cookie: `roost_csrf=${token}`,
        'x-csrf-token': token,
      },
    });
    const response = await csrf.handle(request, destination);
    expect(response.status).toBe(200);
  });

  test('POST request with mismatched tokens returns 403', async () => {
    const request = new Request('http://localhost/api/resource', {
      method: 'POST',
      headers: {
        cookie: 'roost_csrf=cookie-token',
        'x-csrf-token': 'header-token',
      },
    });
    const response = await csrf.handle(request, destination);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('CSRF token mismatch');
  });

  test('POST request without CSRF header returns 403', async () => {
    const request = new Request('http://localhost/api/resource', {
      method: 'POST',
      headers: { cookie: 'roost_csrf=token' },
    });
    const response = await csrf.handle(request, destination);
    expect(response.status).toBe(403);
  });

  test('PUT request validates CSRF', async () => {
    const request = new Request('http://localhost/api/resource', {
      method: 'PUT',
      headers: { cookie: 'roost_csrf=token', 'x-csrf-token': 'different' },
    });
    const response = await csrf.handle(request, destination);
    expect(response.status).toBe(403);
  });

  test('DELETE request validates CSRF', async () => {
    const token = 'delete-token';
    const request = new Request('http://localhost/api/resource', {
      method: 'DELETE',
      headers: { cookie: `roost_csrf=${token}`, 'x-csrf-token': token },
    });
    const response = await csrf.handle(request, destination);
    expect(response.status).toBe(200);
  });
});
