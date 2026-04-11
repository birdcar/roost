import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/orm')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/orm" subtitle="Why Roost uses Active Record on D1, why it is not Prisma, and the design of the query builder and migration system.">
      <h2>Active Record on D1</h2>
      <p>
        Active Record — where the model class is both a domain object and its own database interface
        — has a mixed reputation. Its critics note that it conflates two responsibilities. Its
        defenders note that for the overwhelming majority of CRUD-heavy web applications, having
        the query interface on the model is simply convenient without being architecturally harmful.
        Laravel's Eloquent cemented Active Record as the default for PHP web development precisely
        because it is highly productive for the workloads most applications actually have.
      </p>
      <p>
        Roost's ORM applies this philosophy to Cloudflare D1. D1 is a SQLite-compatible database
        that runs inside Cloudflare's network, close to the Workers executing your code. The
        Active Record model translates directly: <code>User.find(id)</code>, <code>User.where('active', true).all()</code>,
        and <code>user.save()</code> are the query interface. Drizzle ORM provides the underlying
        D1 adapter and SQL generation; Roost's ORM layer adds the Active Record abstraction on top
        of Drizzle's lower-level API.
      </p>

      <h2>Why Not Prisma</h2>
      <p>
        Prisma is the dominant TypeScript ORM and has strong tooling, excellent type safety, and
        wide adoption. It is also a poor fit for Cloudflare Workers. Prisma's query engine is a
        compiled Rust binary that runs as a separate process. Workers cannot spawn processes.
        Prisma's edge adapter works by proxying queries through an HTTP endpoint, which introduces
        latency and additional infrastructure to manage. Drizzle, by contrast, runs entirely in
        the Worker process as pure JavaScript and communicates with D1 through the native binding —
        no separate process, no proxy, no added latency.
      </p>
      <p>
        This is the same reason Roost builds on Drizzle under the hood while providing an Eloquent-style
        interface on top: Drizzle handles the hard problem (D1 compatibility, SQL generation, type
        safety) while Roost handles the ergonomics problem (Active Record conventions, hooks, relationships).
      </p>

      <h2>Query Builder Design</h2>
      <p>
        The <code>QueryBuilder</code> class provides a chainable API for building queries:
        <code>where</code>, <code>orWhere</code>, <code>whereIn</code>, <code>orderBy</code>,
        <code>limit</code>, <code>with</code>. Each method returns a new <code>QueryBuilder</code>
        instance, so chains are immutable — holding a reference to a partially-built query and
        adding to it later is safe. Terminal methods — <code>first()</code>, <code>all()</code>,
        <code>count()</code>, <code>paginate()</code> — execute the query and return results.
      </p>
      <p>
        Raw SQL is not exposed directly. This is a deliberate trade-off: raw SQL is always more
        expressive than any query builder, but it bypasses the type safety and injection protection
        the query builder provides. For the cases where the query builder genuinely cannot express
        a needed query, Drizzle's underlying API is accessible — the ORM does not seal it away.
      </p>

      <h2>Migrations and Rollback Safety</h2>
      <p>
        Roost migrations are TypeScript files with explicit <code>up()</code> and <code>down()</code>
        methods. Every migration that adds something should have a down migration that removes it,
        and Roost enforces this. This is not the universal practice — some migration tools have moved
        away from down migrations, arguing they are rarely used and often wrong. Roost takes the opposite
        position: down migrations are documentation of the schema delta, and having them in place reduces
        the cost of a bad deployment significantly.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/laravel-patterns">Laravel Patterns — the Eloquent model and what Roost adapts</a></li>
        <li><a href="/docs/concepts/edge-computing">Edge Computing — D1 as the edge database and its consistency model</a></li>
        <li><a href="/docs/packages/orm">@roost/orm reference — Model, QueryBuilder, and migration API</a></li>
        <li><a href="https://orm.drizzle.team" target="_blank" rel="noopener noreferrer">Drizzle ORM Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
