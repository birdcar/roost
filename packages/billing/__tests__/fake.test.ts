import { describe, test, expect, beforeEach } from 'bun:test';
import { FakeBillingProvider, Billing } from '../src/fake';

describe('FakeBillingProvider', () => {
  let fake: FakeBillingProvider;

  beforeEach(() => {
    fake = new FakeBillingProvider();
  });

  test('createCustomer records customer', async () => {
    const result = await fake.createCustomer({ name: 'Alice', email: 'alice@test.com' });

    expect(result.providerId).toStartWith('cus_fake_');
    expect(fake.customers).toHaveLength(1);
    expect(fake.customers[0].email).toBe('alice@test.com');
  });

  test('subscribe creates subscription', async () => {
    const result = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro' });

    expect(result.subscriptionId).toStartWith('sub_fake_');
    expect(result.status).toBe('active');
    expect(fake.subscriptions).toHaveLength(1);
  });

  test('subscribe with trial sets trialing status', async () => {
    const result = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro', trialDays: 14 });
    expect(result.status).toBe('trialing');
  });

  test('cancelSubscription records cancellation', async () => {
    const { subscriptionId } = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro' });
    await fake.cancelSubscription(subscriptionId);

    expect(fake.canceledSubscriptions).toContain(subscriptionId);
    const sub = fake.subscriptions.find((s) => s.id === subscriptionId);
    expect(sub?.status).toBe('canceled');
  });

  test('resumeSubscription sets active status', async () => {
    const { subscriptionId } = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro' });
    await fake.cancelSubscription(subscriptionId);
    await fake.resumeSubscription(subscriptionId);

    const sub = fake.subscriptions.find((s) => s.id === subscriptionId);
    expect(sub?.status).toBe('active');
  });

  test('swapSubscription changes price', async () => {
    const { subscriptionId } = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_basic' });
    await fake.swapSubscription(subscriptionId, 'price_pro');

    const sub = fake.subscriptions.find((s) => s.id === subscriptionId);
    expect(sub?.priceId).toBe('price_pro');
  });

  test('createCheckoutSession returns fake URL', async () => {
    const result = await fake.createCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_pro',
      successUrl: 'https://app.com/success',
      cancelUrl: 'https://app.com/cancel',
    });

    expect(result.sessionId).toStartWith('cs_fake_');
    expect(result.url).toContain('stripe.com/fake');
  });

  test('createPortalSession returns fake URL', async () => {
    const result = await fake.createPortalSession({
      customerId: 'cus_1',
      returnUrl: 'https://app.com/billing',
    });

    expect(result.url).toContain('stripe.com/fake/portal');
  });

  test('reportUsage records usage', async () => {
    await fake.reportUsage({ subscriptionItemId: 'si_1', quantity: 100 });
    expect(fake.usageRecords).toHaveLength(1);
    expect(fake.usageRecords[0].quantity).toBe(100);
  });

  test('assertCustomerCreated passes when customer exists', async () => {
    await fake.createCustomer({ name: 'Alice', email: 'alice@test.com' });
    fake.assertCustomerCreated('alice@test.com');
  });

  test('assertCustomerCreated fails when no customer', () => {
    expect(() => fake.assertCustomerCreated()).toThrow('Expected at least one customer');
  });

  test('assertSubscribed passes when subscription exists', async () => {
    await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro' });
    fake.assertSubscribed();
  });

  test('assertCanceled passes for canceled subscription', async () => {
    const { subscriptionId } = await fake.subscribe({ customerId: 'cus_1', priceId: 'price_pro' });
    await fake.cancelSubscription(subscriptionId);
    fake.assertCanceled(subscriptionId);
  });
});

describe('Billing.fake()', () => {
  beforeEach(() => {
    Billing.restore();
  });

  test('fake returns a FakeBillingProvider', () => {
    const fake = Billing.fake();
    expect(fake).toBeInstanceOf(FakeBillingProvider);
  });

  test('getFake returns active fake', () => {
    Billing.fake();
    expect(Billing.getFake()).not.toBeNull();
  });

  test('restore clears the fake', () => {
    Billing.fake();
    Billing.restore();
    expect(Billing.getFake()).toBeNull();
  });
});
