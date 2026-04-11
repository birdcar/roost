import type { BillingProvider } from '../provider-interface.js';
import type {
  CreateCustomerParams,
  CreateCustomerResult,
  SubscribeParams,
  SubscribeResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  PortalSessionParams,
  PortalSessionResult,
  UsageRecordParams,
  SubscriptionStatus,
  WebhookEvent,
} from '../types.js';
import { StripeClient } from './client.js';
import { verifyStripeWebhook } from './webhook.js';

export class StripeProvider implements BillingProvider {
  private client: StripeClient;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.client = new StripeClient(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const result = await this.client.post<{ id: string }>('/customers', {
      name: params.name,
      email: params.email,
      metadata: params.metadata,
    });
    return { providerId: result.id };
  }

  async subscribe(params: SubscribeParams): Promise<SubscribeResult> {
    const body: Record<string, unknown> = {
      customer: params.customerId,
      'items[0][price]': params.priceId,
    };
    if (params.trialDays) {
      body.trial_period_days = params.trialDays;
    }
    if (params.metadata) {
      body.metadata = params.metadata;
    }

    const result = await this.client.post<{
      id: string;
      status: string;
      current_period_end: number;
    }>('/subscriptions', body);

    return {
      subscriptionId: result.id,
      status: mapStripeStatus(result.status),
      currentPeriodEnd: new Date(result.current_period_end * 1000).toISOString(),
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.client.del(`/subscriptions/${subscriptionId}`);
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.client.post(`/subscriptions/${subscriptionId}`, {
      cancel_at_period_end: 'false',
    });
  }

  async swapSubscription(subscriptionId: string, newPriceId: string): Promise<SubscribeResult> {
    const sub = await this.client.get<{ items: { data: Array<{ id: string }> } }>(
      `/subscriptions/${subscriptionId}`
    );
    const itemId = sub.items.data[0]?.id;

    const result = await this.client.post<{
      id: string;
      status: string;
      current_period_end: number;
    }>(`/subscriptions/${subscriptionId}`, {
      'items[0][id]': itemId,
      'items[0][price]': newPriceId,
    });

    return {
      subscriptionId: result.id,
      status: mapStripeStatus(result.status),
      currentPeriodEnd: new Date(result.current_period_end * 1000).toISOString(),
    };
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus> {
    const result = await this.client.get<{ status: string }>(`/subscriptions/${subscriptionId}`);
    return mapStripeStatus(result.status);
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const body: Record<string, unknown> = {
      customer: params.customerId,
      mode: 'subscription',
      'line_items[0][price]': params.priceId,
      'line_items[0][quantity]': '1',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    };
    if (params.trialDays) {
      body['subscription_data[trial_period_days]'] = params.trialDays;
    }

    const result = await this.client.post<{ id: string; url: string }>('/checkout/sessions', body);
    return { sessionId: result.id, url: result.url };
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    const result = await this.client.post<{ url: string }>('/billing_portal/sessions', {
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: result.url };
  }

  async reportUsage(params: UsageRecordParams): Promise<void> {
    await this.client.post(`/subscription_items/${params.subscriptionItemId}/usage_records`, {
      quantity: params.quantity,
      timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
    });
  }

  async parseWebhookEvent(request: Request, _secret?: string): Promise<WebhookEvent> {
    return verifyStripeWebhook(request, _secret ?? this.webhookSecret);
  }
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const mapping: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    paused: 'paused',
  };
  return mapping[stripeStatus] ?? 'incomplete';
}
