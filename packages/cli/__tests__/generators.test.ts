import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { makeModel, makeAgent, makeTool, makeJob, makeMiddleware, makeEvent, makeListener, makeChannel } from '../src/commands/make';

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
      const content = await readFile(join(tempDir, 'src', 'models', 'post.ts'), 'utf-8');

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
      const content = await readFile(join(tempDir, 'src', 'agents', 'assistant.ts'), 'utf-8');

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
      const content = await readFile(join(tempDir, 'src', 'tools', 'search-web.ts'), 'utf-8');

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
      const content = await readFile(join(tempDir, 'src', 'jobs', 'send-welcome-email.ts'), 'utf-8');

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
      const content = await readFile(join(tempDir, 'src', 'middleware', 'rate-limit.ts'), 'utf-8');

      expect(content).toContain('class RateLimitMiddleware implements Middleware');
      expect(content).toContain("import type { Middleware } from '@roost/core'");
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeEvent writes src/events/foo.ts with basic template', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeEvent('Foo');
      const content = await readFile(join(tempDir, 'src', 'events', 'foo.ts'), 'utf-8');

      expect(content).toContain("import { Event } from '@roost/events'");
      expect(content).toContain('class Foo extends Event');
      expect(content).not.toContain('BroadcastableEvent');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeEvent --broadcast writes a template implementing BroadcastableEvent', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeEvent('OrderCreated', { broadcast: true });
      const content = await readFile(join(tempDir, 'src', 'events', 'order-created.ts'), 'utf-8');

      expect(content).toContain('class OrderCreated extends Event implements BroadcastableEvent');
      expect(content).toContain("from '@roost/broadcast'");
      expect(content).toContain('broadcastOn()');
      expect(content).toContain('broadcastWith()');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeListener writes src/listeners/bar.ts with listener template', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeListener('Bar');
      const content = await readFile(join(tempDir, 'src', 'listeners', 'bar.ts'), 'utf-8');

      expect(content).toContain('class Bar implements Listener');
      expect(content).toContain("import type { Listener } from '@roost/events'");
      expect(content).toContain('handle(');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeListener --event includes the event type import', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeListener('Bar', { event: 'OrderCreated' });
      const content = await readFile(join(tempDir, 'src', 'listeners', 'bar.ts'), 'utf-8');

      expect(content).toContain('OrderCreated');
      expect(content).toContain("from '../events/order-created.js'");
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeListener --queued writes a Job-extending ShouldQueue listener', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeListener('Bar', { queued: true });
      const content = await readFile(join(tempDir, 'src', 'listeners', 'bar.ts'), 'utf-8');

      expect(content).toContain("import { Job } from '@roost/queue'");
      expect(content).toContain('extends Job');
      expect(content).toContain('ShouldQueue');
      expect(content).toContain('readonly shouldQueue = true as const');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeChannel writes src/channels/order-channel.ts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeChannel('OrderChannel');
      const content = await readFile(join(tempDir, 'src', 'channels', 'order-channel.ts'), 'utf-8');

      expect(content).toContain('class OrderChannel');
      expect(content).toContain('static authorize(');
      expect(content).not.toContain('presenceData');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('makeChannel --presence includes presenceData() method', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeChannel('OrderChannel', { presence: true });
      const content = await readFile(join(tempDir, 'src', 'channels', 'order-channel.ts'), 'utf-8');

      expect(content).toContain('class OrderChannel');
      expect(content).toContain('static authorize(');
      expect(content).toContain('presenceData(');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('file names are kebab-cased from the class name argument', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeEvent('OrderWasCreated');
      const content = await readFile(join(tempDir, 'src', 'events', 'order-was-created.ts'), 'utf-8');
      expect(content).toContain('class OrderWasCreated extends Event');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('existing file: command warns and skips without overwriting', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await makeEvent('Foo');

      // Second call should exit(1) — we test by catching the process.exit
      const origExit = process.exit.bind(process);
      let exitCode: number | undefined;
      process.exit = ((code?: number) => { exitCode = code; throw new Error(`process.exit(${code})`); }) as typeof process.exit;

      try {
        await makeEvent('Foo');
      } catch (err) {
        // Expected
      } finally {
        process.exit = origExit;
      }

      expect(exitCode).toBe(1);
    } finally {
      process.chdir(origCwd);
    }
  });
});
