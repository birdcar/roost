import { describe, test, expect, spyOn } from 'bun:test';
import { Logger, FakeLogger } from '../src/logger';

describe('Logger', () => {
  test('logs a JSON line with requestId, method, path, level, message, timestamp', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ requestId: 'ray-123', method: 'GET', path: '/api/test' });

    logger.info('request received');

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.requestId).toBe('ray-123');
    expect(entry.method).toBe('GET');
    expect(entry.path).toBe('/api/test');
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('request received');
    expect(entry.timestamp).toBeDefined();
    expect(entry.data).toBeUndefined();

    spy.mockRestore();
  });

  test('each log level emits the correct level field', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ requestId: 'r', method: 'GET', path: '/' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const levels = spy.mock.calls.map((c) => JSON.parse(c[0] as string).level);
    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);

    spy.mockRestore();
  });

  test('data is included when provided', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ requestId: 'r', method: 'POST', path: '/api' });

    logger.info('created', { userId: 'u1', count: 5 });

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.data).toEqual({ userId: 'u1', count: 5 });

    spy.mockRestore();
  });

  test('userId is included in output when present in context', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ requestId: 'r', method: 'GET', path: '/', userId: 'user-42' });

    logger.info('hello');

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.userId).toBe('user-42');

    spy.mockRestore();
  });

  test('userId is omitted from output when not in context', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ requestId: 'r', method: 'GET', path: '/' });

    logger.info('hello');

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.userId).toBeUndefined();

    spy.mockRestore();
  });
});

describe('FakeLogger', () => {
  test('collects log entries without writing to console', () => {
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const fake = Logger.fake();

    fake.info('test message');
    fake.warn('warning');

    expect(fake.entries).toHaveLength(2);
    expect(fake.entries[0]).toMatchObject({
      level: 'info',
      message: 'test message',
      requestId: 'fake-request-id',
      method: 'GET',
      path: '/',
    });
    expect(fake.entries[0].timestamp).toBeDefined();
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test('assertLogged passes when entry exists', () => {
    const fake = Logger.fake();
    fake.info('user created');

    expect(() => fake.assertLogged('info', 'user created')).not.toThrow();
  });

  test('assertLogged matches partial message', () => {
    const fake = Logger.fake();
    fake.error('failed to connect to database: timeout');

    expect(() => fake.assertLogged('error', 'connect to database')).not.toThrow();
  });

  test('assertLogged throws when entry does not exist', () => {
    const fake = Logger.fake();
    fake.info('something else');

    expect(() => fake.assertLogged('error', 'missing')).toThrow(
      /Expected a "error" log containing "missing"/
    );
  });

  test('assertNotLogged passes when level has no entries', () => {
    const fake = Logger.fake();
    fake.info('ok');

    expect(() => fake.assertNotLogged('error')).not.toThrow();
  });

  test('assertNotLogged throws when level has entries', () => {
    const fake = Logger.fake();
    fake.error('bad');

    expect(() => fake.assertNotLogged('error')).toThrow(
      /Expected no "error" logs but found 1/
    );
  });

  test('restore clears collected entries', () => {
    const fake = Logger.fake();
    fake.info('a');
    fake.warn('b');

    expect(fake.entries).toHaveLength(2);

    fake.restore();

    expect(fake.entries).toHaveLength(0);
  });
});
