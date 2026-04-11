import { describe, test, expect } from 'bun:test';
import { RoostContainer, BindingNotFoundError, CircularDependencyError } from '../src/container';

describe('RoostContainer', () => {
  test('singleton returns same instance on multiple resolves', () => {
    const container = new RoostContainer();
    let count = 0;
    container.singleton('counter', () => ({ id: ++count }));

    const a = container.resolve<{ id: number }>('counter');
    const b = container.resolve<{ id: number }>('counter');

    expect(a).toBe(b);
    expect(a.id).toBe(1);
  });

  test('transient returns new instance on each resolve', () => {
    const container = new RoostContainer();
    let count = 0;
    container.bind('counter', () => ({ id: ++count }));

    const a = container.resolve<{ id: number }>('counter');
    const b = container.resolve<{ id: number }>('counter');

    expect(a).not.toBe(b);
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  test('class tokens work as singletons', () => {
    class MyService {
      constructor(public value: string) {}
    }

    const container = new RoostContainer();
    container.singleton(MyService, () => new MyService('hello'));

    const instance = container.resolve(MyService);
    expect(instance).toBeInstanceOf(MyService);
    expect(instance.value).toBe('hello');
    expect(container.resolve(MyService)).toBe(instance);
  });

  test('resolve throws BindingNotFoundError for unregistered token', () => {
    const container = new RoostContainer();

    expect(() => container.resolve('missing')).toThrow(BindingNotFoundError);
    expect(() => container.resolve('missing')).toThrow(/No binding registered for "missing"/);
  });

  test('has returns true for registered tokens', () => {
    const container = new RoostContainer();
    container.bind('exists', () => 'value');

    expect(container.has('exists')).toBe(true);
    expect(container.has('nope')).toBe(false);
  });

  test('scoped container inherits parent singletons', () => {
    const parent = new RoostContainer();
    parent.singleton('shared', () => ({ shared: true }));

    const child = parent.scoped();
    const resolved = child.resolve<{ shared: boolean }>('shared');

    expect(resolved.shared).toBe(true);
  });

  test('scoped container overrides do not leak to parent', () => {
    const parent = new RoostContainer();
    parent.singleton('value', () => 'parent');

    const child = parent.scoped() as RoostContainer;
    child.singleton('value', () => 'child');

    expect(child.resolve('value')).toBe('child');
    expect(parent.resolve('value')).toBe('parent');
  });

  test('scoped container can add new bindings not in parent', () => {
    const parent = new RoostContainer();
    const child = parent.scoped() as RoostContainer;

    child.bind('childOnly', () => 'exclusive');

    expect(child.resolve('childOnly')).toBe('exclusive');
    expect(parent.has('childOnly')).toBe(false);
  });

  test('detects circular dependencies', () => {
    const container = new RoostContainer();
    container.singleton('a', (c) => c.resolve('b'));
    container.singleton('b', (c) => c.resolve('a'));

    expect(() => container.resolve('a')).toThrow(CircularDependencyError);
  });

  test('factory receives container for nested resolution', () => {
    const container = new RoostContainer();
    container.singleton('db', () => ({ connected: true }));
    container.singleton('repo', (c) => ({
      db: c.resolve<{ connected: boolean }>('db'),
    }));

    const repo = container.resolve<{ db: { connected: boolean } }>('repo');
    expect(repo.db.connected).toBe(true);
  });
});
