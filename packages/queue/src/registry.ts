import type { Job } from './job.js';

export class JobRegistry {
  private jobs = new Map<string, typeof Job>();

  register(jobClass: typeof Job): void {
    this.jobs.set(jobClass.name, jobClass);
  }

  resolve(name: string): typeof Job | undefined {
    return this.jobs.get(name);
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  all(): Map<string, typeof Job> {
    return this.jobs;
  }
}
