import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/mcp')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/mcp Guides" subtitle="Task-oriented instructions for building MCP servers with tools, resources, and prompts.">

      <h2>How to create an MCP server</h2>
      <p>Extend <code>McpServer</code>, declare the classes to expose, and set server metadata. The server handles JSON-RPC over HTTP automatically.</p>
      <CodeBlock title="src/mcp/AppServer.ts">{`import { McpServer } from '@roost/mcp';
import { SearchTool } from './tools/SearchTool';
import { DocsResource } from './resources/DocsResource';
import { SummarizePrompt } from './prompts/SummarizePrompt';

export class AppServer extends McpServer {
  tools = [SearchTool];
  resources = [DocsResource];
  prompts = [SummarizePrompt];

  serverName(): string {
    return 'My App MCP Server';
  }

  serverVersion(): string {
    return '1.0.0';
  }

  serverInstructions(): string {
    return 'Use these tools to search and manage content in My App.';
  }
}`}</CodeBlock>
      <p>Mount the server on a route to accept MCP connections from clients like Claude or Cursor. See <a href="/docs/packages/mcp">@roost/mcp reference</a> for mounting details.</p>

      <h2>How to define MCP tools</h2>
      <p>Extend <code>McpTool</code> and implement <code>description()</code>, <code>schema()</code>, and <code>handle()</code>. Return an <code>McpResponse</code>.</p>
      <CodeBlock title="src/mcp/tools/CreatePostTool.ts">{`import { McpTool, McpResponse } from '@roost/mcp';
import { schema } from '@roost/schema';
import type { McpRequest } from '@roost/mcp';
import { Post } from '../../models/Post';

export class CreatePostTool extends McpTool {
  description(): string {
    return 'Create a new blog post draft';
  }

  schema(s: typeof schema) {
    return {
      title: s.string().description('Post title').minLength(1),
      body: s.string().description('Post body in markdown'),
      tags: s.array().items(s.string()).optional().description('Optional tags'),
    };
  }

  async handle(request: McpRequest): Promise<McpResponse> {
    const title = request.get<string>('title');
    const body = request.get<string>('body');
    const tags = request.get<string[] | undefined>('tags');

    const post = await Post.create({ title, body, tags: tags?.join(','), status: 'draft' });

    return McpResponse.text(\`Created draft post "\${title}" with ID \${post.attributes.id}\`);
  }
}`}</CodeBlock>
      <p>To conditionally hide a tool based on configuration or feature flags, implement <code>shouldRegister()</code>:</p>
      <CodeBlock>{`shouldRegister(): boolean {
  return process.env.FEATURE_POST_CREATION === 'true';
}`}</CodeBlock>

      <h2>How to expose resources via MCP</h2>
      <p>Extend <code>McpResource</code> to provide documents or data the AI can read. URIs are unique identifiers for each resource.</p>
      <CodeBlock title="src/mcp/resources/SchemaResource.ts">{`import { McpResource, McpResponse } from '@roost/mcp';
import type { McpRequest } from '@roost/mcp';

export class SchemaResource extends McpResource {
  uri(): string {
    return 'db://schema';
  }

  description(): string {
    return 'The current database schema — table and column definitions';
  }

  mimeType(): string {
    return 'text/plain';
  }

  async handle(request: McpRequest): Promise<McpResponse> {
    // Return a description of the database schema
    const schemaText = \`
Tables:
- users (id INTEGER PK, name TEXT, email TEXT UNIQUE, created_at TEXT)
- posts (id INTEGER PK, title TEXT, body TEXT, author_id INTEGER FK users.id, created_at TEXT)
- comments (id INTEGER PK, body TEXT, post_id INTEGER FK posts.id, author_id INTEGER FK users.id)
    \`.trim();

    return McpResponse.text(schemaText);
  }
}`}</CodeBlock>
      <p>Use protocol-style URIs (<code>docs://</code>, <code>db://</code>, <code>config://</code>) to namespace related resources. The AI client uses these URIs when requesting resource content.</p>

      <h2>How to define MCP prompts</h2>
      <p>Extend <code>McpPrompt</code> to create reusable prompt templates the AI client can invoke by name.</p>
      <CodeBlock title="src/mcp/prompts/ReviewCodePrompt.ts">{`import { McpPrompt, McpResponse } from '@roost/mcp';
import { schema } from '@roost/schema';
import type { McpRequest } from '@roost/mcp';

export class ReviewCodePrompt extends McpPrompt {
  description(): string {
    return 'Review a code snippet for bugs, security issues, and style';
  }

  schema(s: typeof schema) {
    return {
      code: s.string().description('The code snippet to review'),
      language: s.string().description('Programming language').optional(),
    };
  }

  async handle(request: McpRequest): Promise<McpResponse | McpResponse[]> {
    const code = request.get<string>('code');
    const language = request.get<string | undefined>('language') ?? 'unknown';

    const prompt = \`Please review the following \${language} code for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Code style and readability

\\\`\\\`\\\`\${language}
\${code}
\\\`\\\`\\\`

Provide specific, actionable feedback.\`;

    return McpResponse.text(prompt);
  }
}`}</CodeBlock>
      <p>Prompts can return a single <code>McpResponse</code> or an array of them. Arrays are useful for multi-turn prompt scaffolding.</p>

    </DocLayout>
  );
}
