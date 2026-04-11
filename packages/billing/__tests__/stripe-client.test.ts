import { describe, test, expect } from 'bun:test';
import { StripeClient } from '../src/stripe/client';

describe('StripeClient', () => {
  test('encodes form data correctly', () => {
    const client = new StripeClient('sk_test_123');

    // Access private method for testing the encoding
    const encoded = (client as any).encodeFormData({
      customer: 'cus_123',
      'items[0][price]': 'price_abc',
      metadata: { key: 'value' },
    });

    expect(encoded).toContain('customer=cus_123');
    expect(encoded).toContain('items%5B0%5D%5Bprice%5D=price_abc');
    expect(encoded).toContain('metadata%5Bkey%5D=value');
  });

  test('skips null and undefined values', () => {
    const client = new StripeClient('sk_test_123');

    const encoded = (client as any).encodeFormData({
      name: 'Alice',
      email: null,
      phone: undefined,
    });

    expect(encoded).toContain('name=Alice');
    expect(encoded).not.toContain('email');
    expect(encoded).not.toContain('phone');
  });
});
