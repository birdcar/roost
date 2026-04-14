import { verifyWebhook, WebhookPresets, WebhookVerificationError } from '@roost/core';
import type { WebhookEvent } from '../types.js';

export { WebhookVerificationError };

export async function verifyStripeWebhook(
  request: Request,
  secret: string
): Promise<WebhookEvent> {
  const body = await verifyWebhook(request, { ...WebhookPresets.stripe(), secret });
  return JSON.parse(body) as WebhookEvent;
}
