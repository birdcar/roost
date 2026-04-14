import type { EventClass } from './types.js';
import { EventFake } from './fake.js';
import { EventDispatcher } from './dispatcher.js';

const fakes = new WeakMap<Function, EventFake>();

export abstract class Event {
  static async dispatch<T extends Event>(this: EventClass<T>, event: T): Promise<void> {
    const fake = fakes.get(this);
    if (fake) {
      fake.recordDispatch(event);
      return;
    }
    await EventDispatcher.get().dispatch(event);
  }

  static fake(): void {
    fakes.set(this, new EventFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertDispatched<T extends Event>(
    this: EventClass<T>,
    callback?: (event: T) => boolean
  ): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    if (callback) {
      const found = fake.dispatched.some((e) => e instanceof this && callback(e as T));
      if (!found) {
        throw new Error(
          `Expected ${this.name} to be dispatched matching the given callback, but it was not`
        );
      }
    } else {
      const found = fake.dispatched.some((e) => e instanceof this);
      if (!found) {
        throw new Error(
          `Expected ${this.name} to be dispatched, but it was not. Dispatched: ${JSON.stringify(fake.dispatched.map((e) => e.constructor.name))}`
        );
      }
    }
  }

  static assertNotDispatched<T extends Event>(this: EventClass<T>): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);

    const found = fake.dispatched.some((e) => e instanceof this);
    if (found) {
      throw new Error(`Expected ${this.name} not to be dispatched, but it was`);
    }
  }
}
