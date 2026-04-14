import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { Model } from '../src/model';
import { TenantContext } from '../src/tenant-context';

// ---------------------------------------------------------------------------
// Schema & model fixtures
// ---------------------------------------------------------------------------

const postsTable = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  org_id: text('org_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

const globalTable = sqliteTable('configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

class Post extends Model {
  static override tableName = 'posts';
  static override tenantColumn = 'org_id';
  static override timestamps = false;
  static override columns = {
    org_id: text('org_id').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
  };
}

class Config extends Model {
  static override tableName = 'configs';
  static override tenantColumn = null;
  static override timestamps = false;
  static override columns = {
    key: text('key').notNull(),
  };
}

// ---------------------------------------------------------------------------
// Test setup helper — boots models against an in-memory SQLite DB
// ---------------------------------------------------------------------------

function setupDb(ctx: TenantContext) {
  const sqlite = new Database(':memory:');
  sqlite.run(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT,
    updated_at TEXT
  )`);
  sqlite.run(`CREATE TABLE configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  )`);

  const db = drizzle(sqlite, { schema: { posts: postsTable, configs: globalTable } });

  Post._table = postsTable as any;
  Post._db = db as any;
  Post._tenantContext = ctx;

  Config._table = globalTable as any;
  Config._db = db as any;
  Config._tenantContext = ctx;

  return { sqlite, db };
}

function seedPost(sqlite: Database, orgId: string, title: string, status = 'draft') {
  sqlite.run(`INSERT INTO posts (org_id, title, status) VALUES (?, ?, ?)`, [orgId, title, status]);
}

function seedConfig(sqlite: Database, key: string) {
  sqlite.run(`INSERT INTO configs (key) VALUES (?)`, [key]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tenant-scoped query filtering', () => {
  let ctx: TenantContext;
  let sqlite: Database;

  beforeEach(() => {
    ctx = new TenantContext();
    const setup = setupDb(ctx);
    sqlite = setup.sqlite;
  });

  test('Model.all() auto-prepends where org_id = current org', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Acme Post');
    seedPost(sqlite, 'org-2', 'Other Post');

    const posts = await Post.all();

    expect(posts).toHaveLength(1);
    expect((posts[0] as any).title).toBe('Acme Post');
  });

  test('Model.where().all() prepends tenant filter before other conditions', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Draft', 'draft');
    seedPost(sqlite, 'org-1', 'Active', 'active');
    seedPost(sqlite, 'org-2', 'Other Active', 'active');

    const posts = await Post.where('status', 'active').all();

    expect(posts).toHaveLength(1);
    expect((posts[0] as any).title).toBe('Active');
  });

  test('Model.find(id) scopes to current tenant', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-2', 'Stolen Post');

    // Row inserted for org-2 will have id=1
    const result = await Post.find(1);

    expect(result).toBeNull();
  });

  test('create() injects org_id from context, overwriting caller value', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });

    const post = await Post.create({ org_id: 'evil-org', title: 'My Post', status: 'draft' });

    expect((post as any).org_id).toBe('org-1');
  });

  test('save() scopes update to current tenant org_id', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Original');

    const post = await Post.find(1);
    expect(post).not.toBeNull();
    (post!.attributes as any).title = 'Updated';
    await post!.save();

    const row = sqlite.query('SELECT title FROM posts WHERE id = 1').get() as any;
    expect(row.title).toBe('Updated');
  });

  test('delete() scopes the delete to current tenant', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'To Delete');
    seedPost(sqlite, 'org-2', 'Should Survive');

    const post = await Post.find(1);
    await post!.delete();

    const remaining = sqlite.query('SELECT COUNT(*) as n FROM posts').get() as any;
    expect(remaining.n).toBe(1);
    const survivor = sqlite.query('SELECT org_id FROM posts').get() as any;
    expect(survivor.org_id).toBe('org-2');
  });

  test('a model without tenantColumn runs unscoped queries', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedConfig(sqlite, 'plan_limit');
    seedConfig(sqlite, 'feature_flags');

    const configs = await Config.all();

    expect(configs).toHaveLength(2);
  });

  test('withoutTenantScope() disables filtering for the duration of the callback', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Acme');
    seedPost(sqlite, 'org-2', 'Other');

    const posts = await Post.withoutTenantScope(() => Post.all());

    expect(posts).toHaveLength(2);
  });

  test('withoutTenantScope() re-enables filtering after the callback', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Acme');
    seedPost(sqlite, 'org-2', 'Other');

    await Post.withoutTenantScope(() => Post.all());
    const posts = await Post.all();

    expect(posts).toHaveLength(1);
  });

  test('withoutTenantScope() restores filtering even when the callback throws', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });

    await expect(
      Post.withoutTenantScope(async () => { throw new Error('kaboom'); })
    ).rejects.toThrow('kaboom');

    expect(ctx.isBypassed()).toBe(false);
  });

  test('no tenant filter is injected when TenantContext has no data', async () => {
    // ctx.set() never called — data is null
    seedPost(sqlite, 'org-1', 'Post 1');
    seedPost(sqlite, 'org-2', 'Post 2');

    const posts = await Post.all();

    // No filter means all rows are returned
    expect(posts).toHaveLength(2);
  });

  test('tenant filter is the first and condition — not inside an or group', async () => {
    ctx.set({ orgId: 'org-1', orgSlug: 'acme' });
    seedPost(sqlite, 'org-1', 'Draft', 'draft');
    seedPost(sqlite, 'org-2', 'Active', 'active');

    // Without the tenant filter being first, an OR query could leak cross-tenant rows
    const posts = await Post.where('status', 'draft').all();

    expect(posts).toHaveLength(1);
    expect((posts[0] as any).org_id).toBe('org-1');
  });
});
