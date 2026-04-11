import { describe, test, expect } from 'bun:test';
import { ConfigManager, ConfigKeyNotFoundError } from '../src/config';

describe('ConfigManager', () => {
  test('get resolves dot-notation path', () => {
    const config = new ConfigManager({
      database: {
        default: 'd1',
        connections: {
          d1: { binding: 'DB' },
        },
      },
    });

    expect(config.get('database.default')).toBe('d1');
    expect(config.get('database.connections.d1.binding')).toBe('DB');
  });

  test('get returns top-level values', () => {
    const config = new ConfigManager({ name: 'roost' });
    expect(config.get('name')).toBe('roost');
  });

  test('get returns default when key is missing', () => {
    const config = new ConfigManager({});
    expect(config.get('missing', 'fallback')).toBe('fallback');
  });

  test('get throws ConfigKeyNotFoundError for missing key without default', () => {
    const config = new ConfigManager({});
    expect(() => config.get('nope')).toThrow(ConfigKeyNotFoundError);
    expect(() => config.get('nope')).toThrow(/Configuration key "nope" not found/);
  });

  test('has returns correct boolean', () => {
    const config = new ConfigManager({ a: { b: 'value' } });
    expect(config.has('a')).toBe(true);
    expect(config.has('a.b')).toBe(true);
    expect(config.has('a.c')).toBe(false);
    expect(config.has('x')).toBe(false);
  });

  test('set creates nested paths', () => {
    const config = new ConfigManager({});
    config.set('a.b.c', 'deep');
    expect(config.get('a.b.c')).toBe('deep');
  });

  test('set overwrites existing values', () => {
    const config = new ConfigManager({ key: 'old' });
    config.set('key', 'new');
    expect(config.get('key')).toBe('new');
  });

  test('mergeEnv overrides matching config keys', () => {
    const config = new ConfigManager({
      database: { default: 'd1' },
    });

    config.mergeEnv({ DATABASE_DEFAULT: 'postgres' });
    expect(config.get('database.default')).toBe('postgres');
  });

  test('mergeEnv ignores env vars that do not match existing config keys', () => {
    const config = new ConfigManager({ app: { name: 'roost' } });
    config.mergeEnv({ UNKNOWN_KEY: 'value' });
    expect(config.has('unknown.key')).toBe(false);
  });

  test('mergeEnv ignores undefined values', () => {
    const config = new ConfigManager({ app: { name: 'roost' } });
    config.mergeEnv({ APP_NAME: undefined });
    expect(config.get('app.name')).toBe('roost');
  });
});
