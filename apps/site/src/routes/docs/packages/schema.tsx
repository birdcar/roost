import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/schema')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/schema</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Fluent JSON Schema builder. Zero dependencies. Shared by @roost/ai tools and @roost/mcp tools.</p>

      <h2>Usage</h2>
      <pre><code>{`import { schema } from '@roost/schema';

const userSchema = schema.object()
  .property('email', schema.string().description('User email'), true)
  .property('name', schema.string(), true)
  .property('age', schema.integer().min(0).max(150));

userSchema.build();
// { type: 'object', properties: { email: { type: 'string', ... }, ... }, required: ['email', 'name'] }`}</code></pre>

      <h2>Available Types</h2>
      <pre><code>{`schema.string()            // { type: 'string' }
schema.integer()           // { type: 'integer' }
schema.number()            // { type: 'number' }
schema.boolean()           // { type: 'boolean' }
schema.object()            // { type: 'object' }
schema.array()             // { type: 'array' }
schema.enum(['a', 'b'])    // { type: 'string', enum: ['a', 'b'] }`}</code></pre>

      <h2>Modifiers</h2>
      <pre><code>{`.description('...')   .default(value)
.min(n)  .max(n)     // integer, number
.minLength(n)  .maxLength(n)  // string
.items(schema)  .minItems(n)  .maxItems(n)  // array
.property(name, schema, required?)  // object`}</code></pre>
    </div>
  );
}
