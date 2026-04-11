# Audit: @roost/billing

## Status: FIXED

## Exports verified
- `BillingProviderToken` (from `./provider-interface.js`)
- `BillingProvider` (type)
- `StripeProvider` (from `./stripe/provider.js`)
- `StripeClient`, `StripeApiError` (from `./stripe/client.js`)
- `verifyStripeWebhook`, `WebhookVerificationError` (from `./stripe/webhook.js`)
- `FakeBillingProvider`, `Billing` (from `./fake.js`)
- `SubscribedMiddleware`, `OnTrialMiddleware` (from `./middleware.js`)
- `BillingServiceProvider` (from `./service-provider.js`)
- Various types from `./types.js`

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/billing.mdx` | Docs refer to `StripeAdapter` throughout but the actual export is `StripeProvider` | Renamed all occurrences of `StripeAdapter` to `StripeProvider` |
| `apps/site/content/docs/reference/billing.mdx` | Docs refer to `BillingFake` but the actual export is `FakeBillingProvider` (and `Billing` helper object) | Updated class name to `FakeBillingProvider`; added note about `Billing` helper |
| `apps/site/content/docs/reference/billing.mdx` | Docs show `SubscriptionMiddleware` but actual exports are `SubscribedMiddleware` and `OnTrialMiddleware` | Replaced `SubscriptionMiddleware` with `SubscribedMiddleware` and `OnTrialMiddleware` |
| `apps/site/content/docs/reference/billing.mdx` | `verifyStripeWebhook`, `WebhookVerificationError`, `StripeClient`, `StripeApiError` are exported but not documented | Added `StripeClient`, `verifyStripeWebhook`, and `WebhookVerificationError` sections |
| `apps/site/content/docs/concepts/billing.mdx` | Concepts page refers to `StripeProvider` correctly but also says `FakeBillingProvider` — this is actually correct per source | No fix needed on concepts page |
| `apps/site/content/docs/guides/billing.mdx` | Guide imports `SubscriptionMiddleware` (wrong name) | Updated to `SubscribedMiddleware` |
| `apps/site/content/docs/guides/billing.mdx` | Guide imports `BillingFake` (wrong name) | Updated to `FakeBillingProvider` |
| `apps/site/content/docs/reference/billing.mdx` | `resumeSubscription` return type in docs is `Promise<SubscribeResult>` but actual implementation returns `Promise<void>` | Updated signature to `Promise<void>` |
| `apps/site/content/docs/reference/billing.mdx` | `swapSubscription` docs show `SwapSubscriptionParams` object but actual method signatures take `(subscriptionId: string, newPriceId: string)` | Updated both interface doc and method signature |

## Files modified
- `apps/site/content/docs/reference/billing.mdx`
- `apps/site/content/docs/guides/billing.mdx`

## Items requiring human review
- `swapSubscription` in `StripeProvider` and `FakeBillingProvider` both take `(subscriptionId: string, newPriceId: string)` as positional args, not a `SwapSubscriptionParams` object. The `SwapSubscriptionParams` type is exported from `./types.js` but never used by either implementation. Either the implementations need to be updated to accept the params object, or the type should be removed. Flagging for human decision.
