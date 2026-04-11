import type { Container, Token, Factory } from './types.js';

type Lifecycle = 'singleton' | 'transient';

interface Binding<T> {
  factory: Factory<T>;
  instance?: T;
  lifecycle: Lifecycle;
}

export class RoostContainer implements Container {
  private bindings = new Map<Token, Binding<any>>();
  private resolving = new Set<Token>();
  private parent?: RoostContainer;

  bind<T>(token: Token<T>, factory: Factory<T>): void {
    this.bindings.set(token, { factory, lifecycle: 'transient' });
  }

  singleton<T>(token: Token<T>, factory: Factory<T>): void {
    this.bindings.set(token, { factory, lifecycle: 'singleton' });
  }

  resolve<T>(token: Token<T>): T {
    const binding = this.bindings.get(token) ?? this.parent?.getBinding(token);

    if (!binding) {
      const name = typeof token === 'function' ? token.name : String(token);
      throw new BindingNotFoundError(name);
    }

    if (this.resolving.has(token)) {
      const chain = [...this.resolving].map(t =>
        typeof t === 'function' ? t.name : String(t)
      );
      throw new CircularDependencyError(chain);
    }

    if (binding.lifecycle === 'singleton' && binding.instance !== undefined) {
      return binding.instance as T;
    }

    this.resolving.add(token);
    try {
      const instance = binding.factory(this) as T;
      if (binding.lifecycle === 'singleton') {
        binding.instance = instance;
      }
      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  scoped(): Container {
    const child = new RoostContainer();
    child.parent = this;
    return child;
  }

  has(token: Token): boolean {
    return this.bindings.has(token) || (this.parent?.has(token) ?? false);
  }

  private getBinding(token: Token): Binding<any> | undefined {
    return this.bindings.get(token) ?? this.parent?.getBinding(token);
  }
}

export class BindingNotFoundError extends Error {
  constructor(tokenName: string) {
    super(`No binding registered for "${tokenName}". Did you forget to register it in a ServiceProvider?`);
    this.name = 'BindingNotFoundError';
  }
}

export class CircularDependencyError extends Error {
  constructor(chain: string[]) {
    super(`Circular dependency detected: ${chain.join(' → ')}`);
    this.name = 'CircularDependencyError';
  }
}
