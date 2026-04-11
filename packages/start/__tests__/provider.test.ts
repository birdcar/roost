import { describe, test, expect } from 'bun:test';
import { StartServiceProvider } from '../src/provider';
import { Application } from '@roost/core';

describe('StartServiceProvider', () => {
  test('registers without error', async () => {
    const app = Application.create({});
    app.register(StartServiceProvider);
    await app.boot();
    // No error means success — provider is a placeholder for Phase 3+
  });
});
