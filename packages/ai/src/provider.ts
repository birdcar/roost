import { ServiceProvider } from '@roost/core';
import { AIClient } from '@roost/cloudflare';
import { CloudflareAIProvider } from './providers/cloudflare.js';
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
    const provider = this.app.container.resolve(CloudflareAIProvider);
    Agent.setProvider(provider);
  }
}
