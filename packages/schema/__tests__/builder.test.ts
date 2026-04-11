import { describe, test, expect } from 'bun:test';
import { schema } from '../src/builder';

describe('schema builder', () => {
  test('string produces correct schema', () => {
    expect(schema.string().build()).toEqual({ type: 'string' });
  });

  test('string with description and constraints', () => {
    const s = schema.string().description('User email').minLength(5).maxLength(100);
    expect(s.build()).toEqual({
      type: 'string',
      description: 'User email',
      minLength: 5,
      maxLength: 100,
    });
  });

  test('integer with min/max', () => {
    expect(schema.integer().min(0).max(100).build()).toEqual({
      type: 'integer',
      minimum: 0,
      maximum: 100,
    });
  });

  test('number type', () => {
    expect(schema.number().build()).toEqual({ type: 'number' });
  });

  test('boolean type', () => {
    expect(schema.boolean().build()).toEqual({ type: 'boolean' });
  });

  test('enum produces string with enum values', () => {
    expect(schema.enum(['low', 'medium', 'high']).build()).toEqual({
      type: 'string',
      enum: ['low', 'medium', 'high'],
    });
  });

  test('object with required properties', () => {
    const s = schema.object()
      .property('email', schema.string(), true)
      .property('name', schema.string(), true)
      .property('age', schema.integer(), false);

    expect(s.build()).toEqual({
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['email', 'name'],
    });
  });

  test('array with items', () => {
    const s = schema.array().items(schema.string()).minItems(1).maxItems(10);
    expect(s.build()).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
    });
  });

  test('nested object in array', () => {
    const s = schema.array().items(
      schema.object()
        .property('id', schema.integer(), true)
        .property('label', schema.string(), true)
    );

    const built = s.build();
    expect(built.type).toBe('array');
    expect(built.items?.type).toBe('object');
    expect(built.items?.properties?.id).toEqual({ type: 'integer' });
  });

  test('default values', () => {
    expect(schema.string().default('hello').build()).toEqual({
      type: 'string',
      default: 'hello',
    });
  });

  test('builders are immutable (clone on modify)', () => {
    const base = schema.string();
    const withDesc = base.description('A');
    const withOther = base.description('B');

    expect(base.build().description).toBeUndefined();
    expect(withDesc.build().description).toBe('A');
    expect(withOther.build().description).toBe('B');
  });
});
