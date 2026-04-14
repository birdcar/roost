import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { exists } from 'node:fs/promises';
import { toPascalCase, toKebabCase, toTableName } from '../utils.js';

async function writeIfNotExists(path: string, content: string): Promise<void> {
  if (await exists(path)) {
    console.error(`File already exists: ${path}`);
    process.exit(1);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
  console.log(`  Created ${path}`);
}

export async function makeModel(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  const table = toTableName(name);

  const content = `import { Model } from '@roost/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

export class ${pascal} extends Model {
  static tableName = '${table}';

  static columns = {
    // Define your columns here
    // name: text('name').notNull(),
  };
}
`;

  await writeIfNotExists(join('src', 'models', `${kebab}.ts`), content);
}

export async function makeAgent(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import { Agent } from '@roost/ai';

export class ${pascal} extends Agent {
  instructions() {
    return 'You are a helpful assistant.';
  }

  // Uncomment to add tools:
  // tools() {
  //   return [];
  // }
}
`;

  await writeIfNotExists(join('src', 'agents', `${kebab}.ts`), content);
}

export async function makeTool(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import type { Tool, ToolRequest } from '@roost/ai';
import { schema } from '@roost/schema';

export class ${pascal} implements Tool {
  description() {
    return 'Describe what this tool does';
  }

  schema(s: typeof schema) {
    return {
      // Define input parameters
      // query: s.string().description('Search query'),
    };
  }

  async handle(request: ToolRequest): Promise<string> {
    // Implement tool logic here
    return 'Tool result';
  }
}
`;

  await writeIfNotExists(join('src', 'tools', `${kebab}.ts`), content);
}

export async function makeJob(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import { Job } from '@roost/queue';

interface ${pascal}Payload {
  // Define your payload type
}

export class ${pascal} extends Job<${pascal}Payload> {
  async handle() {
    const { } = this.payload;
    // Implement job logic here
  }
}
`;

  await writeIfNotExists(join('src', 'jobs', `${kebab}.ts`), content);
}

export async function makeMiddleware(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import type { Middleware } from '@roost/core';

export class ${pascal}Middleware implements Middleware {
  async handle(
    request: Request,
    next: (request: Request) => Promise<Response>,
    ...args: string[]
  ): Promise<Response> {
    // Add middleware logic here

    return next(request);
  }
}
`;

  await writeIfNotExists(join('src', 'middleware', `${kebab}.ts`), content);
}

export async function makeMcpServer(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import { McpServer, McpTool, McpResponse } from '@roost/mcp';
import { schema } from '@roost/schema';
import type { McpRequest } from '@roost/mcp';

class ExampleTool extends McpTool {
  description() { return 'An example tool'; }
  schema(s: typeof schema) {
    return { input: s.string().description('Input value') };
  }
  handle(request: McpRequest) {
    return McpResponse.text(\`Received: \${request.get<string>('input')}\`);
  }
}

export class ${pascal}Server extends McpServer {
  tools = [ExampleTool];
  resources = [];
  prompts = [];
}
`;

  await writeIfNotExists(join('src', 'mcp', `${kebab}.ts`), content);
}

export async function makeRateLimiter(name: string, variant: 'kv' | 'do'): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = variant === 'kv'
    ? `import { KVRateLimiter } from '@roost/cloudflare';
import type { KVStore } from '@roost/cloudflare';

// Injected via container — bind KVStore instance for your rate limit namespace
export const ${pascal}RateLimiter = (kv: KVStore) =>
  new KVRateLimiter(kv, {
    limit: 100,
    window: 60, // seconds
    keyExtractor: (request) => request.headers.get('CF-Connecting-IP') ?? 'unknown',
  });
`
    : `import { DORateLimiter } from '@roost/cloudflare';
import type { DurableObjectClient } from '@roost/cloudflare';

// Injected via container — bind DurableObjectClient for your rate limit DO
export const ${pascal}RateLimiter = (doClient: DurableObjectClient) =>
  new DORateLimiter(doClient, {
    limit: 100,
    window: 60, // seconds
    keyExtractor: (request) => request.headers.get('CF-Connecting-IP') ?? 'unknown',
  });
`;

  await writeIfNotExists(join('src', 'middleware', `${kebab}-rate-limiter.ts`), content);
}

export async function makeWorkflow(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import { Workflow, Compensable, NonRetryableError } from '@roost/workflow';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface ${pascal}Params {
  // Define workflow input parameters
}

export class ${pascal}Workflow extends Workflow<Env, ${pascal}Params> {
  private compensable = new Compensable();

  async run(event: WorkflowEvent<${pascal}Params>, step: WorkflowStep) {
    try {
      const result = await step.do('step-one', async () => {
        // Implement step logic here.
        // Register a compensation if this step has side effects:
        // this.compensable.register(() => undoStepOne(result));
        return { done: true };
      });

      await step.sleep('wait-before-step-two', '1 minute');

      await step.do('step-two', async () => {
        // Steps may retry up to 5 times with exponential backoff.
        // Throw NonRetryableError for permanent failures:
        // throw new NonRetryableError('Unrecoverable condition');
      });
    } catch (err) {
      await this.compensable.compensate();
      throw err;
    }
  }
}
`;

  await writeIfNotExists(join('src', 'workflows', `${kebab}.ts`), content);
}

export async function makeEvent(name: string, options: { broadcast?: boolean } = {}): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = options.broadcast
    ? `import { Event } from '@roost/events';
import { type BroadcastableEvent, PrivateChannel } from '@roost/broadcast';

export class ${pascal} extends Event implements BroadcastableEvent {
  constructor(readonly id: string) {
    super();
  }

  broadcastOn() {
    return [new PrivateChannel(\`${kebab}.\${this.id}\`)];
  }

  broadcastWith() {
    return { id: this.id };
  }
}
`
    : `import { Event } from '@roost/events';

export class ${pascal} extends Event {
  constructor(
    // Add event properties here
  ) {
    super();
  }
}
`;

  await writeIfNotExists(join('src', 'events', `${kebab}.ts`), content);
}

export async function makeListener(
  name: string,
  options: { event?: string; queued?: boolean } = {}
): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  let content: string;

  if (options.queued) {
    const eventImport = options.event
      ? `import type { ${toPascalCase(options.event)} } from '../events/${toKebabCase(options.event)}.js';\n`
      : '';
    const eventType = options.event ? toPascalCase(options.event) : 'unknown';
    content = `import { Job } from '@roost/queue';
import type { Listener, ShouldQueue } from '@roost/events';
${eventImport}
export class ${pascal} extends Job<${eventType}> implements Listener<${eventType}>, ShouldQueue {
  readonly shouldQueue = true as const;

  async handle(): Promise<void> {
    const event = this.payload;
    // Handle the event
    void event;
  }
}
`;
  } else {
    const eventImport = options.event
      ? `import type { ${toPascalCase(options.event)} } from '../events/${toKebabCase(options.event)}.js';\n`
      : '';
    const eventType = options.event ? toPascalCase(options.event) : 'unknown';
    content = `import type { Listener } from '@roost/events';
${eventImport}
export class ${pascal} implements Listener<${eventType}> {
  async handle(event: ${eventType}): Promise<void> {
    // Handle the event
    void event;
  }
}
`;
  }

  await writeIfNotExists(join('src', 'listeners', `${kebab}.ts`), content);
}

export async function makeChannel(name: string, options: { presence?: boolean } = {}): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = options.presence
    ? `export class ${pascal} {
  static authorize(userId: string, channelParams: Record<string, string>): boolean {
    // Implement authorization logic
    void userId;
    void channelParams;
    return false;
  }

  static presenceData(userId: string): Record<string, unknown> {
    return { id: userId };
  }
}
`
    : `export class ${pascal} {
  static authorize(userId: string, channelParams: Record<string, string>): boolean {
    // Implement authorization logic
    void userId;
    void channelParams;
    return false;
  }
}
`;

  await writeIfNotExists(join('src', 'channels', `${kebab}.ts`), content);
}

export async function makeController(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `// ${pascal} route handlers
// Use these in your route files via server functions

export async function index() {
  // List ${name}s
  return [];
}

export async function show(id: string) {
  // Show single ${name}
  return { id };
}

export async function store(data: Record<string, unknown>) {
  // Create ${name}
  return data;
}

export async function update(id: string, data: Record<string, unknown>) {
  // Update ${name}
  return { id, ...data };
}

export async function destroy(id: string) {
  // Delete ${name}
  return { deleted: id };
}
`;

  await writeIfNotExists(join('src', 'controllers', `${kebab}.ts`), content);
}
