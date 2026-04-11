export interface SessionData {
  userId: string;
  accessToken: string;
  refreshToken: string;
  workosSessionId: string;
  accessTokenExpiresAt: number;
  organizationId: string | null;
  data: Record<string, unknown>;
}
