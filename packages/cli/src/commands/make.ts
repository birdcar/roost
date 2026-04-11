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
