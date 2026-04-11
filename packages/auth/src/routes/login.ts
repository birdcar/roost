import { createServerFn } from '@tanstack/react-start';
import type { WorkOSClient } from '../workos-client.js';
import { WorkOSClientToken } from '../workos-client.js';

export function createLoginHandler(
  getWorkOS: () => WorkOSClient,
  clientId: string,
  callbackUrl: string
) {
  return createServerFn({ method: 'GET' }).handler(async (): Promise<any> => {
    const workos = getWorkOS();
    const url = workos.getAuthorizationUrl({
      clientId,
      redirectUri: callbackUrl,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: url },
    });
  });
}
