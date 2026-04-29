import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { newProject } from '../src/commands/new';

let tempDir: string;

describe('newProject scaffold', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test('writes drizzle.config.ts at project root with d1-http driver', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newProject('test-app');
      const content = await readFile(join(tempDir, 'test-app', 'drizzle.config.ts'), 'utf-8');
      expect(content).toContain("dialect: 'sqlite'");
      expect(content).toContain("driver: 'd1-http'");
      expect(content).toContain("schema: './database/schema.ts'");
      expect(content).toContain("out: './database/migrations'");
      expect(content).toContain('CLOUDFLARE_DATABASE_ID');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('writes database/schema.ts as an empty module barrel', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newProject('test-app');
      const content = await readFile(join(tempDir, 'test-app', 'database', 'schema.ts'), 'utf-8');
      expect(content).toContain('export {}');
      expect(content).toContain('drizzle-kit');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('creates database/migrations and database/seeders with .gitkeep', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newProject('test-app');
      const migrationsKeep = await stat(join(tempDir, 'test-app', 'database', 'migrations', '.gitkeep'));
      const seedersKeep = await stat(join(tempDir, 'test-app', 'database', 'seeders', '.gitkeep'));
      expect(migrationsKeep.isFile()).toBe(true);
      expect(seedersKeep.isFile()).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  test('wrangler.jsonc includes a commented d1_databases block bound to DB', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newProject('test-app');
      const content = await readFile(join(tempDir, 'test-app', 'wrangler.jsonc'), 'utf-8');
      expect(content).toContain('// "d1_databases"');
      expect(content).toContain('"binding": "DB"');
      expect(content).toContain('test-app');

      // Uncommenting the d1_databases block must yield valid JSONC: the property
      // before it needs a trailing comma, and the block itself must not.
      expect(content).toContain('"placement": { "mode": "smart" },');
      expect(content).not.toContain('// ],');
      expect(content).toContain('// ]');
    } finally {
      process.chdir(origCwd);
    }
  });
});
