import { describe, test, expect } from 'bun:test';
import { FakeWorkOSClient } from '../src/workos-client';
import type { WorkOSUser } from '../src/workos-client';

const mockUser: WorkOSUser = {
  id: 'user_123',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  emailVerified: true,
};

describe('FakeWorkOSClient', () => {
  test('getAuthorizationUrl returns fake URL', () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    const url = fake.getAuthorizationUrl({ clientId: 'client_123', redirectUri: 'http://localhost/callback' });
    expect(url).toBe('https://fake.workos.com/authorize');
  });

  test('authenticateWithCode records the code and returns user', async () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    const result = await fake.authenticateWithCode({ clientId: 'client_123', code: 'auth_code_abc' });

    expect(fake.lastAuthCode).toBe('auth_code_abc');
    expect(result.user.id).toBe('user_123');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.accessToken).toContain('.');
    expect(result.refreshToken).toBe('fake-refresh-token');
  });

  test('refreshSession returns new tokens', async () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    const result = await fake.refreshSession({ clientId: 'c', refreshToken: 'old' });

    expect(result.accessToken).toContain('.');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  test('revokeSession records the session ID', async () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    await fake.revokeSession('session_abc');
    await fake.revokeSession('session_def');

    expect(fake.revokedSessions).toEqual(['session_abc', 'session_def']);
  });

  test('getUser returns the mock user', async () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    const user = await fake.getUser('user_123');
    expect(user.email).toBe('alice@example.com');
  });

  test('getWidgetToken returns fake token', async () => {
    const fake = new FakeWorkOSClient({ user: mockUser });
    const token = await fake.getWidgetToken({ userId: 'user_123' });
    expect(token).toBe('fake-widget-token');
  });

  test('listOrganizationMemberships returns configured memberships', async () => {
    const fake = new FakeWorkOSClient({
      user: mockUser,
      memberships: [
        { id: 'mem_1', userId: 'user_123', organizationId: 'org_1', role: { slug: 'admin' } },
      ],
    });

    const memberships = await fake.listOrganizationMemberships('user_123');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role.slug).toBe('admin');
  });
});
