import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { makeModel, makeAgent, makeTool, makeJob, makeMiddleware } from '../src/commands/make';

let tempDir: string;

describe('code generators', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test('makeModel creates model file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeModel('Post');
      const content = await readFile(join(tempDir, 'app', 'models', 'post.ts'), 'utf-8');

      expect(content).toContain('class Post extends Model');
      expect(content).toContain("static tableName = 'posts'");
      expect(content).toContain("import { Model } from '@roost/orm'");
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeAgent creates agent file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeAgent('Assistant');
      const content = await readFile(join(tempDir, 'app', 'agents', 'assistant.ts'), 'utf-8');

      expect(content).toContain('class Assistant extends Agent');
      expect(content).toContain("import { Agent } from '@roost/ai'");
      expect(content).toContain('instructions()');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeTool creates tool file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeTool('SearchWeb');
      const content = await readFile(join(tempDir, 'app', 'tools', 'search-web.ts'), 'utf-8');

      expect(content).toContain('class SearchWeb implements Tool');
      expect(content).toContain('description()');
      expect(content).toContain('schema(');
      expect(content).toContain('handle(');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeJob creates job file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeJob('SendWelcomeEmail');
      const content = await readFile(join(tempDir, 'app', 'jobs', 'send-welcome-email.ts'), 'utf-8');

      expect(content).toContain('class SendWelcomeEmail extends Job');
      expect(content).toContain("import { Job } from '@roost/queue'");
      expect(content).toContain('handle()');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeMiddleware creates middleware file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeMiddleware('RateLimit');
      const content = await readFile(join(tempDir, 'app', 'middleware', 'rate-limit.ts'), 'utf-8');

      expect(content).toContain('class RateLimitMiddleware implements Middleware');
      expect(content).toContain("import type { Middleware } from '@roost/core'");
    } finally {
      process.chdir(origCwd);
    }
  });
});
