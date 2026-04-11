import { ServiceProvider } from '@roost/core';
import { BillingProviderToken } from './provider-interface.js';
import { StripeProvider } from './stripe/provider.js';
import { Billing } from './fake.js';

export class BillingServiceProvider extends ServiceProvider {
  register(): void {
    const env = this.app.env as Record<string, string | undefined>;

    this.app.container.singleton(BillingProviderToken, () => {
      const fake = Billing.getFake();
      if (fake) return fake;

      const secretKey = env.STRIPE_SECRET_KEY;
      const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

      if (!secretKey || !webhookSecret) {
        throw new Error(
          'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET environment variables. ' +
          'Set them in wrangler.toml [vars] or .dev.vars for local development.'
        );
      }

      return new StripeProvider(secretKey, webhookSecret);
    });
  }
}
