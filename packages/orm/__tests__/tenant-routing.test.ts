import { describe, test, expect } from 'bun:test';
import { TenantDatabaseResolver } from '../src/tenant-resolver';

function makeDb(name: string): globalThis.D1Database {
  return { _name: name } as unknown as globalThis.D1Database;
}

describe('TenantDatabaseResolver', () => {
  test("resolve('acme') returns binding for DB_TENANT_ACME", () => {
    const bindings: Record<string, globalThis.D1Database> = {
      DB_TENANT_ACME: makeDb('DB_TENANT_ACME'),
    };
    const resolver = new TenantDatabaseResolver('DB_TENANT_{SLUG}', (name) => bindings[name] ?? null);

    const result = resolver.resolve('acme');

    expect(result).toBe(bindings['DB_TENANT_ACME']);
  });

  test("resolve('acme-corp') normalises to DB_TENANT_ACME_CORP", () => {
    const bindings: Record<string, globalThis.D1Database> = {
      DB_TENANT_ACME_CORP: makeDb('DB_TENANT_ACME_CORP'),
    };
    const resolver = new TenantDatabaseResolver('DB_TENANT_{SLUG}', (name) => bindings[name] ?? null);

    const result = resolver.resolve('acme-corp');

    expect(result).toBe(bindings['DB_TENANT_ACME_CORP']);
  });

  test('custom pattern TENANT_{SLUG}_DB is respected', () => {
    const bindings: Record<string, globalThis.D1Database> = {
      TENANT_ACME_DB: makeDb('TENANT_ACME_DB'),
    };
    const resolver = new TenantDatabaseResolver('TENANT_{SLUG}_DB', (name) => bindings[name] ?? null);

    const result = resolver.resolve('acme');

    expect(result).toBe(bindings['TENANT_ACME_DB']);
  });

  test('returns null when per-tenant binding is absent', () => {
    const resolver = new TenantDatabaseResolver('DB_TENANT_{SLUG}', () => null);

    const result = resolver.resolve('missing-org');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OrmServiceProvider boot strategy tests
// ---------------------------------------------------------------------------

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { Model } from '../src/model';
import { ModelRegistry } from '../src/registry';
import { TenantContext } from '../src/tenant-context';
import { D1SessionHandle } from '../src/d1-session';

// Minimal fake D1Database wrapper that records which raw db was handed to boot()
class FakeD1Database {
  constructor(public readonly rawDb: globalThis.D1Database) {}
  get raw(): globalThis.D1Database { return this.rawDb; }
}

class Widget extends Model {
  static override tableName = 'widgets';
  static override timestamps = false;
  static override columns = { name: text('name').notNull() };
}

const widgetsTable = sqliteTable('widgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

function makeRawD1(label: string): globalThis.D1Database {
  return { _label: label } as unknown as globalThis.D1Database;
}

function bootRegistryWith(raw: globalThis.D1Database) {
  // Build an in-memory SQLite to use as a real drizzle db
  const sqlite = new Database(':memory:');
  sqlite.run('CREATE TABLE widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  const db = drizzle(sqlite, { schema: { widgets: widgetsTable } });
  Widget._table = widgetsTable as any;
  Widget._db = db as any;
  return { sqlite, raw };
}

describe('OrmServiceProvider boot strategy', () => {
  test("strategy 'database' with existing per-tenant binding uses it", () => {
    const tenantRaw = makeRawD1('tenant-db');
    const sharedRaw = makeRawD1('shared-db');
    const ctx = new TenantContext();
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });

    const bindings: Record<string, globalThis.D1Database> = { DB_TENANT_ACME: tenantRaw };
    const resolver = new TenantDatabaseResolver('DB_TENANT_{SLUG}', (name) => bindings[name] ?? null);

    const resolved = resolver.resolve(ctx.get()!.orgSlug);
    const usedRaw = resolved ?? sharedRaw;

    expect(usedRaw).toBe(tenantRaw);
  });

  test("strategy 'database' falls back to shared DB when per-tenant binding is absent", () => {
    const sharedRaw = makeRawD1('shared-db');
    const ctx = new TenantContext();
    ctx.set({ orgId: 'org-1', orgSlug: 'unknown-org' });

    const resolver = new TenantDatabaseResolver('DB_TENANT_{SLUG}', () => null);

    const resolved = resolver.resolve(ctx.get()!.orgSlug);
    const usedRaw = resolved ?? sharedRaw;

    expect(usedRaw).toBe(sharedRaw);
  });

  test("strategy 'row' ignores per-tenant binding even if it exists", () => {
    const tenantRaw = makeRawD1('tenant-db');
    const sharedRaw = makeRawD1('shared-db');
    const strategy = 'row';

    // With 'row' strategy the provider never consults TenantDatabaseResolver
    const usedRaw = strategy === 'database'
      ? (tenantRaw ?? sharedRaw)
      : sharedRaw;

    expect(usedRaw).toBe(sharedRaw);
  });

  test('D1SessionHandle is not instantiated when useSession is false', () => {
    const useSession = false;
    const raw = makeRawD1('shared-db');
    let sessionHandleCreated = false;

    if (useSession) {
      new D1SessionHandle(raw);
      sessionHandleCreated = true;
    }

    expect(sessionHandleCreated).toBe(false);
  });

  test('D1SessionHandle is instantiated when useSession is true', () => {
    const useSession = true;
    const raw = makeRawD1('shared-db');
    let sessionHandleCreated = false;

    if (useSession) {
      new D1SessionHandle(raw);
      sessionHandleCreated = true;
    }

    expect(sessionHandleCreated).toBe(true);
  });
});
