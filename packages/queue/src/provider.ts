import { ServiceProvider } from '@roostjs/core';
import { QueueSender } from '@roostjs/cloudflare';
import { JobRegistry } from './registry.js';
import { Dispatcher } from './dispatcher.js';
import { JobConsumer } from './consumer.js';
import type { Job } from './job.js';

export class QueueServiceProvider extends ServiceProvider {
  private jobClasses: Array<typeof Job> = [];
  private queueBindings: Record<string, string> = { default: 'QUEUE' };

  withJobs(jobs: Array<typeof Job>): this {
    this.jobClasses = jobs;
    return this;
  }

  withQueues(bindings: Record<string, string>): this {
    this.queueBindings = bindings;
    return this;
  }

  register(): void {
    this.app.container.singleton(JobRegistry, () => {
      const registry = new JobRegistry();
      for (const jobClass of this.jobClasses) {
        registry.register(jobClass);
      }
      return registry;
    });

    this.app.container.singleton(JobConsumer, (c) => {
      return new JobConsumer(c.resolve(JobRegistry));
    });
  }

  boot(): void {
    const senders = new Map<string, QueueSender>();
    for (const [name, bindingName] of Object.entries(this.queueBindings)) {
      try {
        const sender = this.app.container.resolve<QueueSender>(bindingName);
        senders.set(name, sender);
      } catch {
        // Queue binding not available — skip (may be in a context without queue bindings)
      }
    }

    if (senders.size > 0) {
      Dispatcher.set(new Dispatcher(senders));
    }
  }
}
