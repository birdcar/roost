import { describe, test, expect, beforeEach } from 'bun:test';
import { Billing, FakeBillingProvider } from '@roostjs/billing';

describe('SaaS billing', () => {
  let fake: FakeBillingProvider;

  beforeEach(() => {
    fake = Billing.fake();
  });

  test('create customer and subscribe', async () => {
    const customer = await fake.createCustomer({ name: 'Acme Inc', email: 'admin@acme.com' });
    expect(customer.providerId).toStartWith('cus_fake_');

    const subscription = await fake.subscribe({
      customerId: customer.providerId,
      priceId: 'price_pro_monthly',
    });
    expect(subscription.status).toBe('active');

    fake.assertCustomerCreated('admin@acme.com');
    fake.assertSubscribed(customer.providerId);
  });

  test('trial subscription', async () => {
    const customer = await fake.createCustomer({ name: 'Startup Co', email: 'cto@startup.co' });
    const subscription = await fake.subscribe({
      customerId: customer.providerId,
      priceId: 'price_pro_monthly',
      trialDays: 14,
    });
    expect(subscription.status).toBe('trialing');
  });

  test('cancel subscription', async () => {
    const customer = await fake.createCustomer({ name: 'Test', email: 'test@test.com' });
    const { subscriptionId } = await fake.subscribe({
      customerId: customer.providerId,
      priceId: 'price_basic',
    });

    await fake.cancelSubscription(subscriptionId);
    fake.assertCanceled(subscriptionId);
  });
});
