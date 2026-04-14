import { ServiceProvider } from '@roostjs/core';
import { AIClient } from '@roostjs/cloudflare';
import { CloudflareAIProvider } from './providers/cloudflare.js';
import { GatewayAIProvider } from './providers/gateway.js';
import { Agent } from './agent.js';

export class AiServiceProvider extends ServiceProvider {
  register(): void {
    this.app.container.singleton(CloudflareAIProvider, (c) => {
      const aiBindingName = this.app.config.get('ai.binding', 'AI');
      const client = c.resolve<AIClient>(aiBindingName);
      return new CloudflareAIProvider(client);
    });
  }

  boot(): void {
    const gatewayAccountId = this.app.config.has('ai.gateway.accountId')
      ? this.app.config.get<string>('ai.gateway.accountId')
      : null;
    const gatewayGatewayId = this.app.config.has('ai.gateway.gatewayId')
      ? this.app.config.get<string>('ai.gateway.gatewayId')
      : null;

    const directProvider = this.app.container.resolve(CloudflareAIProvider);

    if (gatewayAccountId && !gatewayGatewayId) {
      console.warn('[AiServiceProvider] ai.gateway.accountId is set but ai.gateway.gatewayId is missing — using direct provider');
    } else if (!gatewayAccountId && gatewayGatewayId) {
      console.warn('[AiServiceProvider] ai.gateway.gatewayId is set but ai.gateway.accountId is missing — using direct provider');
    }

    const provider = gatewayAccountId && gatewayGatewayId
      ? new GatewayAIProvider({ accountId: gatewayAccountId, gatewayId: gatewayGatewayId }, directProvider)
      : directProvider;

    Agent.setProvider(provider);
  }
}
