import { describe, test, expect } from 'bun:test';
import { OrmNotBootedError, ModelNotFoundError, InvalidRelationError } from '../src/errors';

describe('ORM errors', () => {
  test('OrmNotBootedError has helpful message', () => {
    const err = new OrmNotBootedError('User');
    expect(err.name).toBe('OrmNotBootedError');
    expect(err.message).toContain('User');
    expect(err.message).toContain('OrmServiceProvider');
  });

  test('ModelNotFoundError includes model name and id', () => {
    const err = new ModelNotFoundError('User', 42);
    expect(err.name).toBe('ModelNotFoundError');
    expect(err.message).toContain('User');
    expect(err.message).toContain('42');
  });

  test('InvalidRelationError includes model and relation name', () => {
    const err = new InvalidRelationError('User', 'comments');
    expect(err.name).toBe('InvalidRelationError');
    expect(err.message).toContain('User');
    expect(err.message).toContain('comments');
  });
});
