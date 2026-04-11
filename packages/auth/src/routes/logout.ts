import type { SessionManager } from '../session/manager.js';

export async function handleLogout(
  request: Request,
  sessionManager: SessionManager,
  redirectTo: string = '/auth/login'
): Promise<Response> {
  const result = await sessionManager.destroySession(request);

  const headers: Record<string, string> = { Location: redirectTo };
  if (result?.cookie) {
    headers['Set-Cookie'] = result.cookie;
  }

  return new Response(null, { status: 302, headers });
}
