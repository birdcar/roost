import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { WorkflowFake } from './testing.js';

const fakes = new WeakMap<Function, WorkflowFake>();

export abstract class Workflow<Env = unknown, TParams = unknown>
  extends WorkflowEntrypoint<Env, TParams> {

  abstract run(event: WorkflowEvent<TParams>, step: WorkflowStep): Promise<unknown>;

  static fake(): void {
    fakes.set(this, new WorkflowFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertCreated(id?: string): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertCreated(id);
  }

  static assertNotCreated(): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertNotCreated();
  }

  static _getFake(): WorkflowFake | undefined {
    return fakes.get(this);
  }
}
