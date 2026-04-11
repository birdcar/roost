import { WorkOS } from '@workos-inc/node';

export interface WorkOSClient {
  getAuthorizationUrl(options: AuthorizationUrlOptions): string;
  authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse>;
  refreshSession(options: RefreshSessionOptions): Promise<RefreshSessionResponse>;
  revokeSession(sessionId: string): Promise<void>;
  getUser(userId: string): Promise<WorkOSUser>;
  listOrganizationMemberships(userId: string): Promise<OrganizationMembership[]>;
  getWidgetToken(options: WidgetTokenOptions): Promise<string>;
}

export interface AuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state?: string;
  provider?: string;
  organizationId?: string;
}

export interface AuthenticateWithCodeOptions {
  clientId: string;
  code: string;
}

export interface AuthenticateResponse {
  accessToken: string;
  refreshToken: string;
  user: WorkOSUser;
  organizationId?: string;
  sessionId: string;
}

export interface RefreshSessionOptions {
  clientId: string;
  refreshToken: string;
}

export interface RefreshSessionResponse {
  accessToken: string;
  refreshToken: string;
}

export interface WorkOSUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
}

export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: { slug: string };
}

export interface WidgetTokenOptions {
  userId: string;
  organizationId?: string;
}

export const WorkOSClientToken = 'WorkOSClient' as const;

export class RoostWorkOSClient implements WorkOSClient {
  private sdk: WorkOS;

  constructor(apiKey: string) {
    this.sdk = new WorkOS(apiKey);
  }

  getAuthorizationUrl(options: AuthorizationUrlOptions): string {
    return this.sdk.userManagement.getAuthorizationUrl(options);
  }

  async authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse> {
    const result = await this.sdk.userManagement.authenticateWithCode(options);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user as WorkOSUser,
      organizationId: result.organizationId ?? undefined,
      sessionId: (result as any).session?.id ?? result.user.id,
    };
  }

  async refreshSession(options: RefreshSessionOptions): Promise<RefreshSessionResponse> {
    const result = await this.sdk.userManagement.authenticateWithRefreshToken(options);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sdk.userManagement.revokeSession({ sessionId });
  }

  async getUser(userId: string): Promise<WorkOSUser> {
    return this.sdk.userManagement.getUser(userId) as Promise<WorkOSUser>;
  }

  async listOrganizationMemberships(userId: string): Promise<OrganizationMembership[]> {
    const result = await this.sdk.userManagement.listOrganizationMemberships({ userId });
    return result.data as OrganizationMembership[];
  }

  async getWidgetToken(options: WidgetTokenOptions): Promise<string> {
    const result = await this.sdk.widgets.getToken({ user: options.userId } as any) as any;
    return typeof result === 'string' ? result : result.token;
  }
}

export class FakeWorkOSClient implements WorkOSClient {
  private user: WorkOSUser;
  public revokedSessions: string[] = [];
  public lastAuthCode: string | null = null;
  public memberships: OrganizationMembership[] = [];

  constructor(options: { user: WorkOSUser; memberships?: OrganizationMembership[] }) {
    this.user = options.user;
    this.memberships = options.memberships ?? [];
  }

  getAuthorizationUrl(_options: AuthorizationUrlOptions): string {
    return 'https://fake.workos.com/authorize';
  }

  async authenticateWithCode(options: AuthenticateWithCodeOptions): Promise<AuthenticateResponse> {
    this.lastAuthCode = options.code;
    return {
      accessToken: createFakeJwt({ sub: this.user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'fake-refresh-token',
      user: this.user,
      sessionId: 'fake-session-id',
    };
  }

  async refreshSession(_options: RefreshSessionOptions): Promise<RefreshSessionResponse> {
    return {
      accessToken: createFakeJwt({ sub: this.user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'new-refresh-token',
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.revokedSessions.push(sessionId);
  }

  async getUser(_userId: string): Promise<WorkOSUser> {
    return this.user;
  }

  async listOrganizationMemberships(_userId: string): Promise<OrganizationMembership[]> {
    return this.memberships;
  }

  async getWidgetToken(_options: WidgetTokenOptions): Promise<string> {
    return 'fake-widget-token';
  }
}

function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}
