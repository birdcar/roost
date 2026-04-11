import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/schema')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/schema" subtitle="Fluent JSON Schema builder with zero runtime dependencies. Used by @roost/ai and @roost/mcp to define tool and prompt parameters.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/schema`}</CodeBlock>

      <h2>schema API</h2>
      <p>
        The named export <code>schema</code> is a factory object. Call its methods to create
        typed <code>SchemaBuilder</code> instances. Call <code>.build()</code> on any builder
        to produce a plain JSON Schema object.
      </p>

      <h3>Type Constructors</h3>

      <h4><code>schema.string(): StringSchemaBuilder</code></h4>
      <p>Create a JSON Schema string type.</p>

      <h4><code>schema.integer(): NumberSchemaBuilder</code></h4>
      <p>Create a JSON Schema integer type.</p>

      <h4><code>schema.number(): NumberSchemaBuilder</code></h4>
      <p>Create a JSON Schema number type (decimal).</p>

      <h4><code>schema.boolean(): BooleanSchemaBuilder</code></h4>
      <p>Create a JSON Schema boolean type.</p>

      <h4><code>schema.object(): ObjectSchemaBuilder</code></h4>
      <p>Create a JSON Schema object type.</p>

      <h4><code>schema.array(): ArraySchemaBuilder</code></h4>
      <p>Create a JSON Schema array type.</p>

      <h4><code>schema.enum&lt;T extends string&gt;(values: T[]): EnumSchemaBuilder&lt;T&gt;</code></h4>
      <p>Create a JSON Schema enum type constrained to the provided string values.</p>

      <h4><code>schema.null(): NullSchemaBuilder</code></h4>
      <p>Create a JSON Schema null type.</p>

      <h4><code>schema.any(): AnySchemaBuilder</code></h4>
      <p>Create a schema with no type constraint (validates any value).</p>

      <h2>Universal SchemaBuilder Methods</h2>
      <p>Available on all <code>SchemaBuilder</code> instances.</p>

      <h4><code>.description(text: string): this</code></h4>
      <p>Set the <code>description</code> field in the JSON Schema output.</p>

      <h4><code>.default(value: unknown): this</code></h4>
      <p>Set the <code>default</code> field.</p>

      <h4><code>.example(value: unknown): this</code></h4>
      <p>Set the <code>examples</code> field.</p>

      <h4><code>.deprecated(): this</code></h4>
      <p>Set <code>deprecated: true</code> in the output.</p>

      <h4><code>.optional(): this</code></h4>
      <p>Mark the field as optional when used inside an object schema's property map.</p>

      <h4><code>.build(): JsonSchemaOutput</code></h4>
      <p>Compile the builder to a plain JSON Schema object.</p>

      <h2>StringSchemaBuilder Methods</h2>

      <h4><code>.minLength(n: number): this</code></h4>
      <p>Set the <code>minLength</code> constraint.</p>

      <h4><code>.maxLength(n: number): this</code></h4>
      <p>Set the <code>maxLength</code> constraint.</p>

      <h4><code>.pattern(regex: string): this</code></h4>
      <p>Set the <code>pattern</code> constraint (ECMAScript regex string).</p>

      <h4><code>.format(format: string): this</code></h4>
      <p>Set the <code>format</code> hint. Common values: <code>'email'</code>, <code>'date'</code>, <code>'time'</code>, <code>'uri'</code>.</p>

      <h2>NumberSchemaBuilder Methods</h2>
      <p>Applies to both <code>schema.integer()</code> and <code>schema.number()</code>.</p>

      <h4><code>.min(n: number): this</code></h4>
      <p>Set the <code>minimum</code> constraint (inclusive).</p>

      <h4><code>.max(n: number): this</code></h4>
      <p>Set the <code>maximum</code> constraint (inclusive).</p>

      <h4><code>.exclusiveMin(n: number): this</code></h4>
      <p>Set the <code>exclusiveMinimum</code> constraint (value must be strictly greater than n).</p>

      <h4><code>.exclusiveMax(n: number): this</code></h4>
      <p>Set the <code>exclusiveMaximum</code> constraint (value must be strictly less than n).</p>

      <h4><code>.multipleOf(n: number): this</code></h4>
      <p>Set the <code>multipleOf</code> constraint.</p>

      <h2>ObjectSchemaBuilder Methods</h2>

      <h4><code>.property(name: string, builder: SchemaBuilder, required?: boolean): this</code></h4>
      <p>
        Add a named property. Pass <code>true</code> for <code>required</code> to include
        the key in the <code>required</code> array. Defaults to optional.
      </p>

      <h4><code>.properties(obj: Record&lt;string, SchemaBuilder&gt;): this</code></h4>
      <p>Add multiple properties at once. All are treated as optional.</p>

      <h4><code>.additionalProperties(value: boolean | SchemaBuilder): this</code></h4>
      <p>Set the <code>additionalProperties</code> constraint.</p>

      <h4><code>.minProperties(n: number): this</code></h4>
      <p>Set the minimum number of properties.</p>

      <h4><code>.maxProperties(n: number): this</code></h4>
      <p>Set the maximum number of properties.</p>

      <h2>ArraySchemaBuilder Methods</h2>

      <h4><code>.items(builder: SchemaBuilder): this</code></h4>
      <p>Define the schema for array items.</p>

      <h4><code>.minItems(n: number): this</code></h4>
      <p>Set the minimum array length.</p>

      <h4><code>.maxItems(n: number): this</code></h4>
      <p>Set the maximum array length.</p>

      <h4><code>.uniqueItems(value: boolean): this</code></h4>
      <p>Set the <code>uniqueItems</code> constraint.</p>

      <h2>Types</h2>
      <CodeBlock>{`type JsonSchemaOutput = Record<string, unknown>;

interface SchemaBuilder {
  description(text: string): this;
  default(value: unknown): this;
  example(value: unknown): this;
  deprecated(): this;
  optional(): this;
  build(): JsonSchemaOutput;
}

type StringSchemaBuilder = SchemaBuilder & { ... };
type NumberSchemaBuilder = SchemaBuilder & { ... };
type BooleanSchemaBuilder = SchemaBuilder & { ... };
type ObjectSchemaBuilder = SchemaBuilder & { ... };
type ArraySchemaBuilder = SchemaBuilder & { ... };
type EnumSchemaBuilder<T extends string> = SchemaBuilder & { ... };`}</CodeBlock>

    </DocLayout>
  );
}
