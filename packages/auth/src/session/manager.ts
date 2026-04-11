import type { WorkOSClient } from '../workos-client.js';
import type { KVSessionStore } from './store.js';
import type { SessionData } from './types.js';
import type { RoostUser } from '../user.js';

const SESSION_COOKIE_NAME = 'roost_session';
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export class SessionManager {
  constructor(
    private store: KVSessionStore,
    private workos: WorkOSClient,
    private clientId: string
  ) {}

  async loadSession(request: Request): Promise<SessionData | null> {
    const sessionId = parseCookie(request, SESSION_COOKIE_NAME);
    if (!sessionId) return null;

    const sessionData = await this.store.get(sessionId);
    if (!sessionData) return null;

    const now = Math.floor(Date.now() / 1000);
    if (sessionData.accessTokenExpiresAt - now < TOKEN_REFRESH_BUFFER_SECONDS) {
      return this.refreshSession(sessionId, sessionData);
    }

    return sessionData;
  }

  async createSession(
    authResponse: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      userId: string;
      organizationId: string | null;
    }
  ): Promise<{ sessionId: string; cookie: string }> {
    const sessionId = crypto.randomUUID();

    const sessionData: SessionData = {
      userId: authResponse.userId,
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
      workosSessionId: authResponse.sessionId,
      accessTokenExpiresAt: parseJwtExpiry(authResponse.accessToken),
      organizationId: authResponse.organizationId,
      data: {},
    };

    await this.store.put(sessionId, sessionData);

    return {
      sessionId,
      cookie: buildSetCookie(SESSION_COOKIE_NAME, sessionId, SESSION_MAX_AGE),
    };
  }

  async destroySession(request: Request): Promise<{ cookie: string } | null> {
    const sessionId = parseCookie(request, SESSION_COOKIE_NAME);
    if (!sessionId) return null;

    const sessionData = await this.store.get(sessionId);
    if (sessionData) {
      await Promise.all([
        this.store.delete(sessionId),
        this.workos.revokeSession(sessionData.workosSessionId),
      ]);
    }

    return { cookie: buildSetCookie(SESSION_COOKIE_NAME, '', 0) };
  }

  async resolveUser(request: Request): Promise<RoostUser | null> {
    const sessionData = await this.loadSession(request);
    if (!sessionData) return null;

    const workosUser = await this.workos.getUser(sessionData.userId);
    const memberships = await this.workos.listOrganizationMemberships(sessionData.userId);

    return {
      id: workosUser.id,
      email: workosUser.email,
      firstName: workosUser.firstName,
      lastName: workosUser.lastName,
      emailVerified: workosUser.emailVerified,
      organizationId: sessionData.organizationId,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        role: m.role.slug,
      })),
    };
  }

  private async refreshSession(
    sessionId: string,
    sessionData: SessionData
  ): Promise<SessionData> {
    const refreshed = await this.workos.refreshSession({
      clientId: this.clientId,
      refreshToken: sessionData.refreshToken,
    });

    const updated: SessionData = {
      ...sessionData,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: parseJwtExpiry(refreshed.accessToken),
    };

    await this.store.put(sessionId, updated);
    return updated;
  }
}

export function parseJwtExpiry(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid JWT: missing payload segment');

  const decoded = JSON.parse(atob(payload)) as { exp?: number };
  if (typeof decoded.exp !== 'number') {
    throw new Error('Invalid JWT: missing exp claim');
  }
  return decoded.exp;
}

export function parseCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  const match = header.split(';').find((c) => c.trim().startsWith(`${name}=`));
  if (!match) return undefined;

  return match.split('=').slice(1).join('=').trim();
}

export function buildSetCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
