import { describe, test, expect, beforeEach } from 'bun:test';
import { SessionManager, parseJwtExpiry, parseCookie, buildSetCookie } from '../src/session/manager';
import { KVSessionStore } from '../src/session/store';
import { FakeWorkOSClient } from '../src/workos-client';
import type { WorkOSUser } from '../src/workos-client';
import { KVStore } from '@roostjs/cloudflare';

const mockUser: WorkOSUser = {
  id: 'user_123',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  emailVerified: true,
};

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata: unknown }>();
  return {
    get(key: string, type?: any) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (type === 'json') return Promise.resolve(JSON.parse(entry.value));
      return Promise.resolve(entry.value);
    },
    getWithMetadata(key: string, type?: any) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve({ value: null, metadata: null });
      const value = type === 'json' ? JSON.parse(entry.value) : entry.value;
      return Promise.resolve({ value, metadata: entry.metadata });
    },
    put(key: string, value: any, options?: any) {
      store.set(key, { value: String(value), metadata: options?.metadata });
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true, cursor: '', cacheStatus: null });
    },
  } as unknown as KVNamespace;
}

function makeRequest(cookieHeader?: string): Request {
  const headers = new Headers();
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new Request('http://localhost/', { headers });
}

function createFakeJwt(expInSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const payload = btoa(JSON.stringify({ sub: 'user_123', exp: expInSeconds }));
  return `${header}.${payload}.sig`;
}

describe('SessionManager', () => {
  let kvStore: KVSessionStore;
  let fakeWorkOS: FakeWorkOSClient;
  let manager: SessionManager;

  beforeEach(() => {
    kvStore = new KVSessionStore(new KVStore(createMockKV()));
    fakeWorkOS = new FakeWorkOSClient({ user: mockUser });
    manager = new SessionManager(kvStore, fakeWorkOS, 'client_123');
  });

  test('loadSession returns null when no cookie present', async () => {
    const result = await manager.loadSession(makeRequest());
    expect(result).toBeNull();
  });

  test('loadSession returns null when session not in KV', async () => {
    const result = await manager.loadSession(makeRequest('roost_session=nonexistent'));
    expect(result).toBeNull();
  });

  test('createSession stores session and returns cookie', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const { sessionId, cookie } = await manager.createSession({
      accessToken: createFakeJwt(futureExp),
      refreshToken: 'refresh_123',
      sessionId: 'workos_session_1',
      userId: 'user_123',
      organizationId: null,
    });

    expect(sessionId).toBeTruthy();
    expect(cookie).toContain('roost_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');

    const stored = await kvStore.get(sessionId);
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe('user_123');
  });

  test('loadSession returns data for valid session', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const { sessionId } = await manager.createSession({
      accessToken: createFakeJwt(futureExp),
      refreshToken: 'refresh_123',
      sessionId: 'workos_session_1',
      userId: 'user_123',
      organizationId: 'org_1',
    });

    const result = await manager.loadSession(makeRequest(`roost_session=${sessionId}`));
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user_123');
    expect(result!.organizationId).toBe('org_1');
  });

  test('destroySession removes from KV and revokes on WorkOS', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const { sessionId } = await manager.createSession({
      accessToken: createFakeJwt(futureExp),
      refreshToken: 'refresh_123',
      sessionId: 'workos_session_1',
      userId: 'user_123',
      organizationId: null,
    });

    const result = await manager.destroySession(makeRequest(`roost_session=${sessionId}`));
    expect(result).not.toBeNull();
    expect(result!.cookie).toContain('Max-Age=0');
    expect(fakeWorkOS.revokedSessions).toContain('workos_session_1');

    const stored = await kvStore.get(sessionId);
    expect(stored).toBeNull();
  });

  test('resolveUser returns RoostUser for valid session', async () => {
    fakeWorkOS = new FakeWorkOSClient({
      user: mockUser,
      memberships: [
        { id: 'mem_1', userId: 'user_123', organizationId: 'org_1', role: { slug: 'admin' } },
      ],
    });
    manager = new SessionManager(kvStore, fakeWorkOS, 'client_123');

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const { sessionId } = await manager.createSession({
      accessToken: createFakeJwt(futureExp),
      refreshToken: 'refresh_123',
      sessionId: 'workos_session_1',
      userId: 'user_123',
      organizationId: 'org_1',
    });

    const user = await manager.resolveUser(makeRequest(`roost_session=${sessionId}`));
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user_123');
    expect(user!.email).toBe('alice@example.com');
    expect(user!.memberships).toHaveLength(1);
    expect(user!.memberships[0].role).toBe('admin');
  });
});

describe('parseJwtExpiry', () => {
  test('extracts exp claim from JWT', () => {
    const jwt = createFakeJwt(1700000000);
    expect(parseJwtExpiry(jwt)).toBe(1700000000);
  });

  test('throws on invalid JWT', () => {
    expect(() => parseJwtExpiry('not-a-jwt')).toThrow('Invalid JWT');
  });
});

describe('parseCookie', () => {
  test('extracts cookie value by name', () => {
    const req = makeRequest('a=1; roost_session=abc123; b=2');
    expect(parseCookie(req, 'roost_session')).toBe('abc123');
  });

  test('returns undefined for missing cookie', () => {
    const req = makeRequest('a=1; b=2');
    expect(parseCookie(req, 'roost_session')).toBeUndefined();
  });

  test('returns undefined when no cookie header', () => {
    const req = makeRequest();
    expect(parseCookie(req, 'roost_session')).toBeUndefined();
  });
});

describe('buildSetCookie', () => {
  test('builds HttpOnly Secure SameSite cookie', () => {
    const cookie = buildSetCookie('name', 'value', 3600);
    expect(cookie).toContain('name=value');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=3600');
  });
});
