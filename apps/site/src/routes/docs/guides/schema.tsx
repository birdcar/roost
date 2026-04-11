import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/schema')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/schema Guides" subtitle="Task-oriented instructions for defining tool input schemas, optional fields, nested objects, and descriptions.">

      <h2>How to define a tool input schema</h2>
      <p>Return a record of field names to schema builders from the <code>schema()</code> method in any AI tool or MCP tool. All fields are required by default.</p>
      <CodeBlock title="src/tools/SearchTool.ts">{`import { type Tool, type ToolRequest } from '@roost/ai';
import { schema } from '@roost/schema';

export class SearchTool implements Tool {
  description(): string {
    return 'Search articles by keyword';
  }

  schema(s: typeof schema) {
    return {
      query: s.string().description('The search query'),
      limit: s.integer().min(1).max(50).description('Max results to return'),
      sortBy: s.enum(['relevance', 'date', 'views']).description('Result ordering'),
    };
  }

  async handle(request: ToolRequest): Promise<string> {
    const query = request.get<string>('query');
    const limit = request.get<number>('limit');
    const sortBy = request.get<'relevance' | 'date' | 'views'>('sortBy');

    const results = await searchArticles({ query, limit, sortBy });
    return JSON.stringify(results);
  }
}`}</CodeBlock>

      <h2>How to use optional and nested schemas</h2>
      <p>Chain <code>.optional()</code> to make a field not required. Use <code>s.object()</code> to nest structured data.</p>
      <CodeBlock>{`import { schema } from '@roost/schema';

// Optional primitive
const s_optional_number = schema.integer().min(0).optional();

// Optional object
const s_filter = schema.object()
  .property('status', schema.enum(['active', 'inactive']), true)
  .property('createdAfter', schema.string().format('date'))
  .optional()
  .description('Optional filter criteria');

// In a tool schema method
schema(s: typeof schema) {
  return {
    query: s.string().description('Search query'),
    // Optional fields — AI will omit them if not needed
    page: s.integer().min(1).default(1).optional(),
    filter: s.object()
      .property('status', s.enum(['draft', 'published']), true)
      .optional()
      .description('Optional status filter'),
  };
}`}</CodeBlock>
      <p>Nested objects in tool schemas let the AI provide structured sub-parameters. Access them with <code>request.get&lt;T&gt;('fieldName')</code> where T is the inferred object type.</p>

      <h2>How to add descriptions to schema fields</h2>
      <p>Chain <code>.description()</code> on every field. The AI model uses these descriptions to decide what values to pass — clear descriptions reduce tool call errors.</p>
      <CodeBlock>{`import { schema } from '@roost/schema';

// Descriptions help the model understand intent and constraints
const createUserSchema = {
  name: schema.string()
    .description('Full name of the user (first and last)')
    .minLength(2)
    .maxLength(100),

  email: schema.string()
    .description('Valid email address — must be unique in the system')
    .format('email'),

  role: schema.enum(['user', 'admin', 'moderator'])
    .description('User role. Defaults to user for most signups; use admin for internal team members only')
    .default('user'),

  age: schema.integer()
    .description('Age in years. Must be 13 or older')
    .min(13)
    .optional(),
};`}</CodeBlock>
      <p>Good description guidelines: state the purpose, mention format constraints (ISO 8601, UUID, etc.), and call out non-obvious rules. Avoid restating the type — the model already knows <code>email</code> is a string.</p>
      <CodeBlock>{`// Too terse — model won't know the format
{ date: schema.string() }

// Good — explicit format and timezone expectation
{ date: schema.string().description('ISO 8601 date string (e.g. 2024-01-15). Use UTC.') }

// Too verbose — restates the type
{ count: schema.integer().description('An integer representing the count of items') }

// Good — states the constraint and purpose
{ count: schema.integer().description('Number of results to return. Max 100.').max(100) }`}</CodeBlock>

    </DocLayout>
  );
}
