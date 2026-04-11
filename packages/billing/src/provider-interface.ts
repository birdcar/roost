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
} from './types.js';

export interface BillingProvider {
  createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult>;
  subscribe(params: SubscribeParams): Promise<SubscribeResult>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  swapSubscription(subscriptionId: string, newPriceId: string): Promise<SubscribeResult>;
  getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus>;
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;
  createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult>;
  reportUsage(params: UsageRecordParams): Promise<void>;
  parseWebhookEvent(request: Request, secret: string): Promise<import('./types.js').WebhookEvent>;
}

export const BillingProviderToken = 'BillingProvider' as const;
