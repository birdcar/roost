import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/')({ component: Page });

function Page() {
  return (
    <DocLayout title="Concepts" subtitle="Explanations of architecture, design decisions, and how things work under the hood.">
      <p>
        Concept pages explain <em>why</em> Roost is built the way it is. They cover architecture,
        design trade-offs, and the thinking behind each package — reading material for when you want
        to deepen your understanding rather than look up a specific API.
      </p>

      <h2>Architecture</h2>
      <p>These pages explain how Roost's parts fit together and the broader decisions that shaped the framework.</p>
      <ul>
        <li><Link to="/docs/concepts/architecture">Application Architecture</Link> — Request lifecycle, boot sequence, and the middleware pipeline</li>
        <li><Link to="/docs/concepts/service-container">Service Container</Link> — Dependency injection, service providers, and the boot protocol</li>
        <li><Link to="/docs/concepts/edge-computing">Edge Computing</Link> — Why Cloudflare Workers, the V8 isolate model, and what the binding system is</li>
        <li><Link to="/docs/concepts/laravel-patterns">Laravel-Inspired Patterns</Link> — What Roost adopted, what it changed, and the DX philosophy</li>
        <li><Link to="/docs/concepts/testing-philosophy">Testing Philosophy</Link> — Fakes over mocks, TestClient, and integration-first testing</li>
      </ul>

      <h2>Package Concepts</h2>
      <p>Each package has its own design rationale. These pages explain why each package is built the way it is.</p>
      <ul>
        <li><Link to="/docs/concepts/core">@roost/core</Link> — Why a DI container for Workers, pipeline middleware design</li>
        <li><Link to="/docs/concepts/cloudflare">@roost/cloudflare</Link> — Typed binding wrappers, name resolution, AIClient design</li>
        <li><Link to="/docs/concepts/start">@roost/start</Link> — TanStack Start integration, the context bridge, SSR on Workers</li>
        <li><Link to="/docs/concepts/auth">@roost/auth</Link> — Why WorkOS, session storage on KV, organization model</li>
        <li><Link to="/docs/concepts/orm">@roost/orm</Link> — Active Record on D1, why not Prisma, migration design</li>
        <li><Link to="/docs/concepts/ai">@roost/ai</Link> — Class-based agents, the agentic loop, Workers AI and no API keys</li>
        <li><Link to="/docs/concepts/mcp">@roost/mcp</Link> — What MCP is, server-side tool exposure, MCP vs AI tools</li>
        <li><Link to="/docs/concepts/billing">@roost/billing</Link> — Abstract billing interface, adapter pattern, webhook verification</li>
        <li><Link to="/docs/concepts/queue">@roost/queue</Link> — CF Queues model, job lifecycle, retry and backoff</li>
        <li><Link to="/docs/concepts/cli">@roost/cli</Link> — Code generation philosophy, scaffolding, convention enforcement</li>
        <li><Link to="/docs/concepts/testing">@roost/testing</Link> — TestClient, test application setup, connection to testing philosophy</li>
        <li><Link to="/docs/concepts/schema">@roost/schema</Link> — Fluent schema builder, JSON Schema output, shared AI and MCP schemas</li>
      </ul>
    </DocLayout>
  );
}
