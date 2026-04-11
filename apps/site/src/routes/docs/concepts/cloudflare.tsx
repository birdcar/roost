import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/cloudflare')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cloudflare" subtitle="Why Roost wraps Cloudflare's native bindings, how typed clients improve the developer experience, and how binding names are resolved.">
      <h2>The Raw Binding Problem</h2>
      <p>
        Cloudflare injects bindings into the Worker's <code>env</code> object. Accessing KV looks
        like <code>env.SESSION_KV.get(key)</code>, D1 like <code>env.DB.prepare(sql)</code>.
        This works, but it has friction. The binding names are strings that must match
        <code>wrangler.toml</code> exactly. The types are broad Cloudflare platform types that do
        not carry information about which database or namespace they represent. And when application
        code reaches directly into <code>env</code>, it becomes harder to test — tests need to
        fabricate an <code>env</code> object with the right shape.
      </p>
      <p>
        <code>@roost/cloudflare</code> solves this by providing thin typed wrappers — <code>KVStore</code>,
        <code>D1Database</code>, <code>R2Bucket</code>, <code>Queue</code>, <code>AIClient</code> —
        and registering them in the service container under the binding's configured name. Application
        code resolves the binding by name from the container rather than reading <code>env</code>
        directly. The container is responsible for wrapping the raw binding object. Tests can register
        fake implementations under the same name.
      </p>

      <h2>Binding Name Resolution</h2>
      <p>
        The <code>CloudflareServiceProvider</code> reads binding configuration from the application's
        config and registers each binding in the container. When auth session storage wants a KV store,
        it resolves it from the container by the configured name — not by reaching into <code>env</code>.
        This indirection lets binding names be configured in one place (the config or environment
        variables), and lets the container act as the source of truth for what bindings the
        application uses.
      </p>
      <p>
        The naming convention follows Cloudflare's own conventions: KV namespaces in SCREAMING_SNAKE_CASE,
        because that is how Cloudflare workers.toml defines them. Roost does not rename them — it reads
        the name from config and registers the wrapper under that exact name. This keeps the container
        names in sync with the Cloudflare configuration without transformation.
      </p>

      <h2>Why a Single <code>AIClient.run()</code></h2>
      <p>
        Cloudflare Workers AI exposes a single method: <code>ai.run(model, inputs)</code>. Every
        Workers AI task — text generation, image classification, embeddings, speech-to-text — uses
        this one method with different model strings and input shapes. Roost's <code>AIClient</code>
        wraps this directly: <code>client.run(model, inputs)</code>. There are no per-task methods,
        no <code>client.generateText()</code> or <code>client.embed()</code>. This is intentional.
      </p>
      <p>
        The alternative — a method per task — would require updating the client every time Workers AI
        adds a new task type. The pass-through design stays current without changes, and the
        <code>@roost/ai</code> package builds the higher-level agent abstraction on top of
        <code>AIClient.run()</code>. The cloudflare package stays thin; the AI package adds
        structure.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/edge-computing">Edge Computing — bindings, the Workers runtime, and what they mean for design</a></li>
        <li><a href="/docs/concepts/ai">@roost/ai concepts — how the agent abstraction uses AIClient</a></li>
        <li><a href="/docs/packages/cloudflare">@roost/cloudflare reference — all binding wrapper APIs</a></li>
        <li><a href="https://developers.cloudflare.com/workers-ai/" target="_blank" rel="noopener noreferrer">Cloudflare Workers AI Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
