export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface CreateCustomerParams {
  name: string;
  email: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerResult {
  providerId: string;
}

export interface SubscribeParams {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface SubscribeResult {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
}

export interface CheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface PortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface UsageRecordParams {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}
