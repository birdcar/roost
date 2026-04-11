export { BillingProviderToken } from './provider-interface.js';
export type { BillingProvider } from './provider-interface.js';

export { StripeProvider } from './stripe/provider.js';
export { StripeClient, StripeApiError } from './stripe/client.js';
export { verifyStripeWebhook, WebhookVerificationError } from './stripe/webhook.js';

export { FakeBillingProvider, Billing } from './fake.js';

export { SubscribedMiddleware, OnTrialMiddleware } from './middleware.js';
export { BillingServiceProvider } from './service-provider.js';

export type {
  SubscriptionStatus,
  CreateCustomerParams,
  CreateCustomerResult,
  SubscribeParams,
  SubscribeResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  PortalSessionParams,
  PortalSessionResult,
  UsageRecordParams,
  WebhookEvent,
} from './types.js';
