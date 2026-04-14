import { describe, test, expect } from 'bun:test';
import { D1SessionHandle } from '../src/d1-session';

// ---------------------------------------------------------------------------
// Mock D1Database that records withSession() calls
// ---------------------------------------------------------------------------

interface MockD1 extends globalThis.D1Database {
  withSessionCalls: Array<string | undefined>;
  withSession(token?: string): MockD1;
}

function makeMockD1(): MockD1 {
  const calls: Array<string | undefined> = [];
  const db: MockD1 = {
    withSessionCalls: calls,
    withSession(token?: string): MockD1 {
      calls.push(token);
      // Return a new mock that shares the call log so we can assert on the parent
      return makeMockD1WithLog(calls);
    },
  } as unknown as MockD1;
  return db;
}

function makeMockD1WithLog(calls: Array<string | undefined>): MockD1 {
  const db: MockD1 = {
    withSessionCalls: calls,
    withSession(token?: string): MockD1 {
      calls.push(token);
      return makeMockD1WithLog(calls);
    },
  } as unknown as MockD1;
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('D1SessionHandle', () => {
  test('before any write, sessionAwareRaw() returns the plain DB handle', () => {
    const mockDb = makeMockD1();
    const handle = new D1SessionHandle(mockDb);

    const raw = handle.sessionAwareRaw();

    expect(raw).toBe(mockDb);
    expect(mockDb.withSessionCalls).toHaveLength(0);
  });

  test('after markWritten(), sessionAwareRaw() calls db.withSession() with no token', () => {
    const mockDb = makeMockD1();
    const handle = new D1SessionHandle(mockDb);

    handle.markWritten();
    handle.sessionAwareRaw();

    expect(mockDb.withSessionCalls).toHaveLength(1);
    expect(mockDb.withSessionCalls[0]).toBeUndefined();
  });

  test('after markWritten(token), sessionAwareRaw() calls db.withSession(token)', () => {
    const mockDb = makeMockD1();
    const handle = new D1SessionHandle(mockDb);
    const token = 'sess_abc123';

    handle.markWritten(token);
    handle.sessionAwareRaw();

    expect(mockDb.withSessionCalls).toHaveLength(1);
    expect(mockDb.withSessionCalls[0]).toBe(token);
  });

  test('multiple reads after a write all use the same session token', () => {
    const mockDb = makeMockD1();
    const handle = new D1SessionHandle(mockDb);
    const token = 'sess_stable';

    handle.markWritten(token);
    handle.sessionAwareRaw();
    handle.sessionAwareRaw();
    handle.sessionAwareRaw();

    // Each call to sessionAwareRaw re-invokes withSession with the same token
    expect(mockDb.withSessionCalls).toHaveLength(3);
    expect(mockDb.withSessionCalls.every((t) => t === token)).toBe(true);
  });

  test('session token does not persist across requests (fresh handle has no token)', () => {
    const mockDb = makeMockD1();

    const handle1 = new D1SessionHandle(mockDb);
    handle1.markWritten('sess_req1');

    // Simulating a new request — new handle from same underlying DB
    const handle2 = new D1SessionHandle(mockDb);
    const raw = handle2.sessionAwareRaw();

    // handle2 never had markWritten called — should return plain DB
    expect(raw).toBe(mockDb);
    expect(mockDb.withSessionCalls).toHaveLength(0);
  });

  test('sessionAwareRaw() falls back to plain handle when withSession is not available', () => {
    // D1 binding without withSession (e.g. local Miniflare)
    const plainDb = {} as globalThis.D1Database;
    const handle = new D1SessionHandle(plainDb);

    handle.markWritten();
    const raw = handle.sessionAwareRaw();

    // Should fall back without throwing
    expect(raw).toBe(plainDb);
  });
});
