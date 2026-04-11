import type { Model } from './model.js';
import type { ModelAttributes } from './types.js';

export abstract class Factory<T extends typeof Model = typeof Model> {
  protected model: T;
  private _count = 1;
  private _states: Array<(attrs: ModelAttributes) => ModelAttributes> = [];

  constructor(model: T) {
    this.model = model;
  }

  abstract definition(): ModelAttributes;

  count(n: number): this {
    this._count = n;
    return this;
  }

  state(modifier: (attrs: ModelAttributes) => ModelAttributes): this {
    this._states.push(modifier);
    return this;
  }

  async make(): Promise<InstanceType<T>[]> {
    const results: InstanceType<T>[] = [];
    for (let i = 0; i < this._count; i++) {
      let attrs = this.definition();
      for (const s of this._states) {
        attrs = s(attrs);
      }
      results.push(new (this.model as any)(attrs) as InstanceType<T>);
    }
    return results;
  }

  async makeOne(): Promise<InstanceType<T>> {
    const [result] = await this.count(1).make();
    return result;
  }

  async create(): Promise<InstanceType<T>[]> {
    const results: InstanceType<T>[] = [];
    for (let i = 0; i < this._count; i++) {
      let attrs = this.definition();
      for (const s of this._states) {
        attrs = s(attrs);
      }
      const instance = await this.model.create(attrs);
      results.push(instance as InstanceType<T>);
    }
    return results;
  }

  async createOne(): Promise<InstanceType<T>> {
    const [result] = await this.count(1).create();
    return result;
  }
}
