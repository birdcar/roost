import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/schema')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/schema" subtitle="Why Roost has a schema builder, what it produces, and why the same schema definitions power both AI tools and MCP tools.">
      <h2>Why a Fluent Builder Instead of Raw JSON Schema</h2>
      <p>
        JSON Schema is the standard for describing the shape of data exchanged between AI models
        and tools. Both OpenAI's function calling and Anthropic's tool use accept JSON Schema
        objects to describe tool parameters. Writing JSON Schema by hand is verbose and error-prone:
        nested property definitions, required arrays that must be kept in sync with the property
        keys, and no IDE assistance for schema-specific properties like <code>minimum</code> or
        <code>enum</code>.
      </p>
      <p>
        The <code>schema</code> builder provides a TypeScript-native API for constructing these
        JSON Schema objects. <code>schema.string().minLength(2).description('User name')</code>
        reads naturally and produces the equivalent JSON Schema. The builder is immutable — each
        method returns a new builder instance — so partial schemas can be safely shared and extended.
        And because the builder has TypeScript types, IDEs can autocomplete schema-specific methods
        and type-check the values passed to them.
      </p>

      <h2>What the Builder Produces</h2>
      <p>
        The builder is transparent: it produces plain JSON Schema objects. Calling <code>.build()</code>
        on any builder returns the <code>JsonSchemaOutput</code> it describes. There is no special
        Roost schema format to learn — what comes out of the builder is the same JSON Schema that
        AI providers and MCP clients already understand. The builder is a construction aid, not an
        abstraction layer that hides the underlying format.
      </p>
      <p>
        This transparency matters for debugging. When an AI model misinterprets a tool parameter,
        the first step is inspecting the schema that was sent. Because the schema is plain JSON,
        it can be logged, diffed, and compared with the AI provider's documentation directly.
      </p>

      <h2>Shared Schema Between AI and MCP</h2>
      <p>
        Both <code>@roost/ai</code> and <code>@roost/mcp</code> use the same schema builder for
        defining tool parameters. An AI agent tool and an MCP tool that do similar things use
        identical schema definitions. This is not a coincidence — it reflects the fact that AI
        tool calling and MCP tool calling are describing the same concept: a typed function that
        an AI model can invoke.
      </p>
      <p>
        In practice, this means a tool can often be implemented once and registered in both places.
        The schema definition is shared; only the registration differs. Teams that want to expose
        their AI tools externally via MCP can reuse the schema they already wrote.
      </p>

      <h2>Type Inference Limits</h2>
      <p>
        The builder cannot infer TypeScript types from schemas the way Zod can. Calling
        <code>schema.string()</code> does not produce a TypeScript type <code>string</code> that
        flows through into the rest of your code. This is a deliberate scope choice: the schema
        package is specifically for producing JSON Schema objects for AI and MCP integrations,
        not for general runtime validation or type inference. For validation, Zod or Valibot are
        better fits. For AI tool parameters, the schema builder does exactly what is needed.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/ai">@roost/ai concepts — how tool schemas are used by agents</a></li>
        <li><a href="/docs/concepts/mcp">@roost/mcp concepts — how MCP tools use schema definitions</a></li>
        <li><a href="/docs/packages/schema">@roost/schema reference — all builder methods and types</a></li>
      </ul>
    </DocLayout>
  );
}
