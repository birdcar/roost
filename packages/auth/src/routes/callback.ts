import type { WorkOSClient } from '../workos-client.js';
import type { SessionManager } from '../session/manager.js';

export async function handleCallback(
  request: Request,
  workos: WorkOSClient,
  sessionManager: SessionManager,
  clientId: string,
  successRedirect: string = '/dashboard'
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  const authResponse = await workos.authenticateWithCode({ clientId, code });

  const { cookie } = await sessionManager.createSession({
    accessToken: authResponse.accessToken,
    refreshToken: authResponse.refreshToken,
    sessionId: authResponse.sessionId,
    userId: authResponse.user.id,
    organizationId: authResponse.organizationId ?? null,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: successRedirect,
      'Set-Cookie': cookie,
    },
  });
}
