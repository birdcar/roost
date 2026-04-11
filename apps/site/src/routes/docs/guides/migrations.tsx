import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/migrations')({ component: Page });

function Page() {
  return (
    <DocLayout title="Migrations" subtitle="Task-oriented instructions for creating, running, and managing database schema changes.">

      <h2>How to create a migration</h2>
      <p>Use <code>roost make:migration</code> to generate a timestamped migration file in <code>database/migrations/</code>.</p>
      <CodeBlock title="terminal">{`roost make:migration create_posts_table
roost make:migration add_status_to_posts
roost make:migration drop_legacy_table`}</CodeBlock>
      <p>The generator creates a class with empty <code>up()</code> and <code>down()</code> methods. Write the forward change in <code>up()</code> and its inverse in <code>down()</code>.</p>
      <CodeBlock title="database/migrations/0001_create_posts_table.ts">{`import { Migration } from '@roost/orm';

export default class CreatePostsTable extends Migration {
  async up(): Promise<void> {
    await this.db.run(\`
      CREATE TABLE posts (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        title    TEXT    NOT NULL,
        slug     TEXT    NOT NULL UNIQUE,
        body     TEXT    NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        status   TEXT    NOT NULL DEFAULT 'draft',
        created_at TEXT  NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT  NOT NULL DEFAULT (datetime('now'))
      )
    \`);
  }

  async down(): Promise<void> {
    await this.db.run('DROP TABLE IF EXISTS posts');
  }
}`}</CodeBlock>

      <h2>How to run pending migrations</h2>
      <p>Run <code>roost migrate</code> to apply all migrations that haven't been recorded in the database yet.</p>
      <CodeBlock title="terminal">{`roost migrate`}</CodeBlock>
      <p>The CLI prints each migration as it runs. Migrations are recorded in a <code>migrations</code> table so they only run once. To run against a remote (production) D1 database, use the <code>wrangler</code> CLI directly:</p>
      <CodeBlock title="terminal">{`wrangler d1 execute my-app-db --remote --file=database/migrations/0001_create_posts_table.ts`}</CodeBlock>

      <h2>How to rollback migrations</h2>
      <p>Use <code>roost migrate:rollback</code> to undo the most recently applied batch.</p>
      <CodeBlock title="terminal">{`# Rollback the last batch
roost migrate:rollback`}</CodeBlock>
      <p>Always implement <code>down()</code> in migrations you may need to roll back. Migrations without a <code>down()</code> cannot be reversed by the CLI.</p>

      <h2>How to reset and re-run all migrations</h2>
      <p>Use <code>roost migrate:reset</code> to roll back every migration and re-run them all. This is destructive — only use it in development.</p>
      <CodeBlock title="terminal">{`# Rollback everything and re-migrate from scratch
roost migrate:reset`}</CodeBlock>

      <h2>How to define columns</h2>
      <p>D1 uses SQLite syntax. Common column types and patterns:</p>
      <CodeBlock>{`-- Text and numbers
id       INTEGER PRIMARY KEY AUTOINCREMENT
name     TEXT    NOT NULL
email    TEXT    NOT NULL UNIQUE
score    REAL    NOT NULL DEFAULT 0.0
count    INTEGER NOT NULL DEFAULT 0
active   INTEGER NOT NULL DEFAULT 1  -- boolean: 0 or 1

-- JSON (stored as text, query with json_extract)
metadata TEXT

-- Timestamps (stored as ISO 8601 text)
created_at TEXT NOT NULL DEFAULT (datetime('now'))
updated_at TEXT NOT NULL DEFAULT (datetime('now'))
deleted_at TEXT                          -- nullable for soft deletes
published_at TEXT                        -- nullable optional datetime

-- Foreign keys
author_id INTEGER NOT NULL REFERENCES users(id)
org_id    INTEGER REFERENCES organizations(id) ON DELETE SET NULL`}</CodeBlock>

      <h2>How to add indexes and foreign keys</h2>
      <p>Add indexes in the same migration or a separate one. Name indexes consistently: <code>{'idx_{table}_{column}'}</code>.</p>
      <CodeBlock>{`async up(): Promise<void> {
  // Composite index for common query patterns
  await this.db.run(\`
    CREATE INDEX idx_posts_author_status ON posts (author_id, status)
  \`);

  // Unique index
  await this.db.run(\`
    CREATE UNIQUE INDEX idx_posts_slug ON posts (slug)
  \`);

  // Foreign key (already enforced by REFERENCES in column definition)
  // SQLite requires PRAGMA foreign_keys = ON at connection time to enforce them
}

async down(): Promise<void> {
  await this.db.run('DROP INDEX IF EXISTS idx_posts_author_status');
  await this.db.run('DROP INDEX IF EXISTS idx_posts_slug');
}`}</CodeBlock>
      <p>Related: <a href="/docs/guides/orm">ORM guides</a> for model definitions, <a href="/docs/reference/orm">@roost/orm reference</a> for the full Migration API.</p>

    </DocLayout>
  );
}
