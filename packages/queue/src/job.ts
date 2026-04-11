import type { JobConfig, JobMessage, SerializedJob } from './types.js';
import { DEFAULT_JOB_CONFIG } from './types.js';
import { Dispatcher } from './dispatcher.js';

const fakes = new WeakMap<Function, JobFake>();

export abstract class Job<TPayload = unknown> {
  static _jobConfig: JobConfig = { ...DEFAULT_JOB_CONFIG };

  readonly payload: TPayload;
  readonly attempt: number;

  constructor(payload: TPayload, attempt = 1) {
    this.payload = payload;
    this.attempt = attempt;
  }

  abstract handle(): Promise<void> | void;

  onSuccess?(): Promise<void> | void;
  onFailure?(error: Error): Promise<void> | void;

  static async dispatch<T>(this: new (payload: T, attempt?: number) => Job<T>, payload: T): Promise<void> {
    const fake = fakes.get(this);
    if (fake) {
      fake.recordDispatch(this.name, payload);
      return;
    }
    await Dispatcher.get().dispatch(this, payload);
  }

  static async dispatchAfter<T>(this: new (payload: T, attempt?: number) => Job<T>, seconds: number, payload: T): Promise<void> {
    const fake = fakes.get(this);
    if (fake) {
      fake.recordDispatch(this.name, payload);
      return;
    }
    await Dispatcher.get().dispatchAfter(this, seconds, payload);
  }

  static chain(jobs: Array<{ jobClass: typeof Job; payload: unknown }>): Promise<void> {
    return Dispatcher.get().chain(jobs);
  }

  static batch(jobs: Array<{ jobClass: typeof Job; payload: unknown }>): Promise<string> {
    return Dispatcher.get().batch(jobs);
  }

  static fake(): void {
    fakes.set(this, new JobFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertDispatched(jobClassOrName?: string | typeof Job): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    if (jobClassOrName) {
      const name = typeof jobClassOrName === 'string' ? jobClassOrName : jobClassOrName.name;
      const found = fake.dispatched.some((d) => d.jobName === name);
      if (!found) {
        throw new Error(`Expected ${name} to be dispatched, but it was not. Dispatched: ${JSON.stringify(fake.dispatched.map(d => d.jobName))}`);
      }
    } else {
      if (fake.dispatched.length === 0) {
        throw new Error(`Expected at least one job to be dispatched, but none were`);
      }
    }
  }

  static assertNotDispatched(): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    if (fake.dispatched.length > 0) {
      throw new Error(`Expected no jobs dispatched, but ${fake.dispatched.length} were dispatched`);
    }
  }
}

class JobFake {
  public dispatched: Array<{ jobName: string; payload: unknown }> = [];

  recordDispatch(jobName: string, payload: unknown): void {
    this.dispatched.push({ jobName, payload });
  }
}
