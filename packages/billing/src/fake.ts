import type { BillingProvider } from './provider-interface.js';
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
} from './types.js';

export class FakeBillingProvider implements BillingProvider {
  public customers: Array<CreateCustomerParams & { id: string }> = [];
  public subscriptions: Array<SubscribeParams & { id: string; status: SubscriptionStatus }> = [];
  public canceledSubscriptions: string[] = [];
  public usageRecords: UsageRecordParams[] = [];
  public webhookEvents: WebhookEvent[] = [];

  private customerCounter = 0;
  private subscriptionCounter = 0;

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const id = `cus_fake_${++this.customerCounter}`;
    this.customers.push({ ...params, id });
    return { providerId: id };
  }

  async subscribe(params: SubscribeParams): Promise<SubscribeResult> {
    const id = `sub_fake_${++this.subscriptionCounter}`;
    this.subscriptions.push({ ...params, id, status: params.trialDays ? 'trialing' : 'active' });
    return {
      subscriptionId: id,
      status: params.trialDays ? 'trialing' : 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    this.canceledSubscriptions.push(subscriptionId);
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) sub.status = 'canceled';
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) sub.status = 'active';
  }

  async swapSubscription(subscriptionId: string, newPriceId: string): Promise<SubscribeResult> {
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) sub.priceId = newPriceId;
    return {
      subscriptionId,
      status: sub?.status ?? 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus> {
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    return sub?.status ?? 'incomplete';
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    return {
      sessionId: 'cs_fake_' + crypto.randomUUID().slice(0, 8),
      url: `https://checkout.stripe.com/fake/${params.priceId}`,
    };
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    return { url: `https://billing.stripe.com/fake/portal?return=${encodeURIComponent(params.returnUrl)}` };
  }

  async reportUsage(params: UsageRecordParams): Promise<void> {
    this.usageRecords.push(params);
  }

  async parseWebhookEvent(request: Request): Promise<WebhookEvent> {
    const body = await request.json() as WebhookEvent;
    this.webhookEvents.push(body);
    return body;
  }

  assertCustomerCreated(email?: string): void {
    if (email) {
      const found = this.customers.some((c) => c.email === email);
      if (!found) throw new Error(`Expected customer with email "${email}" to be created`);
    } else if (this.customers.length === 0) {
      throw new Error('Expected at least one customer to be created');
    }
  }

  assertSubscribed(customerId?: string): void {
    if (customerId) {
      const found = this.subscriptions.some((s) => s.customerId === customerId);
      if (!found) throw new Error(`Expected subscription for customer "${customerId}"`);
    } else if (this.subscriptions.length === 0) {
      throw new Error('Expected at least one subscription');
    }
  }

  assertCanceled(subscriptionId: string): void {
    if (!this.canceledSubscriptions.includes(subscriptionId)) {
      throw new Error(`Expected subscription "${subscriptionId}" to be canceled`);
    }
  }
}

let activeFake: FakeBillingProvider | null = null;

export const Billing = {
  fake(): FakeBillingProvider {
    activeFake = new FakeBillingProvider();
    return activeFake;
  },

  restore(): void {
    activeFake = null;
  },

  getFake(): FakeBillingProvider | null {
    return activeFake;
  },
};
