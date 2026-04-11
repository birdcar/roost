import { describe, test, expect, beforeEach } from 'bun:test';
import { registerHook, fireHook, clearHooks } from '../src/hooks';

class FakeModel {}

describe('hooks', () => {
  beforeEach(() => {
    clearHooks(FakeModel);
  });

  test('fireHook returns true when no hooks registered', async () => {
    const result = await fireHook(FakeModel, 'creating', {});
    expect(result).toBe(true);
  });

  test('registerHook and fireHook calls the hook', async () => {
    let called = false;
    registerHook(FakeModel, 'creating', () => { called = true; });

    await fireHook(FakeModel, 'creating', {});
    expect(called).toBe(true);
  });

  test('hook returning false aborts', async () => {
    registerHook(FakeModel, 'creating', () => false);

    const result = await fireHook(FakeModel, 'creating', {});
    expect(result).toBe(false);
  });

  test('multiple hooks run in order', async () => {
    const order: number[] = [];
    registerHook(FakeModel, 'creating', () => { order.push(1); });
    registerHook(FakeModel, 'creating', () => { order.push(2); });

    await fireHook(FakeModel, 'creating', {});
    expect(order).toEqual([1, 2]);
  });

  test('clearHooks removes all hooks', async () => {
    let called = false;
    registerHook(FakeModel, 'creating', () => { called = true; });
    clearHooks(FakeModel);

    await fireHook(FakeModel, 'creating', {});
    expect(called).toBe(false);
  });

  test('hooks for different events are independent', async () => {
    let creatingCalled = false;
    let updatingCalled = false;
    registerHook(FakeModel, 'creating', () => { creatingCalled = true; });
    registerHook(FakeModel, 'updating', () => { updatingCalled = true; });

    await fireHook(FakeModel, 'creating', {});
    expect(creatingCalled).toBe(true);
    expect(updatingCalled).toBe(false);
  });
});
