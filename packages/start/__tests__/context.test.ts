import { describe, test, expect, beforeEach } from 'bun:test';
import { bootApp, getApp, createRoostContext, resetAppCache } from '../src/context';
import { Application } from '@roostjs/core';

describe('context bridge', () => {
  beforeEach(() => {
    resetAppCache();
  });

  test('bootApp caches the application on first call', () => {
    let callCount = 0;
    const factory = () => {
      callCount++;
      return Application.create({});
    };

    const app1 = bootApp(factory);
    const app2 = bootApp(factory);

    expect(app1).toBe(app2);
    expect(callCount).toBe(1);
  });

  test('getApp returns cached app after bootApp', () => {
    const app = Application.create({});
    bootApp(() => app);

    expect(getApp()).toBe(app);
  });

  test('getApp throws if no app has been booted', () => {
    expect(() => getApp()).toThrow('Roost Application not initialized');
  });

  test('createRoostContext returns scoped container', () => {
    const app = Application.create({});
    app.container.singleton('shared', () => 'value');

    const ctx1 = createRoostContext(app);
    const ctx2 = createRoostContext(app);

    expect(ctx1.app).toBe(app);
    expect(ctx2.app).toBe(app);
    expect(ctx1.container).not.toBe(ctx2.container);
    expect(ctx1.container.resolve('shared')).toBe('value');
    expect(ctx2.container.resolve('shared')).toBe('value');
  });

  test('resetAppCache clears the cached app', () => {
    bootApp(() => Application.create({}));
    expect(() => getApp()).not.toThrow();

    resetAppCache();
    expect(() => getApp()).toThrow('Roost Application not initialized');
  });
});
