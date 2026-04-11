import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/laravel-patterns')({ component: Page });

function Page() {
  return (
    <DocLayout title="Laravel-Inspired Patterns" subtitle="Which Laravel patterns Roost adopts, what it deliberately changes, and the developer-experience philosophy behind both choices.">
      <h2>Why Draw From Laravel at All</h2>
      <p>
        Laravel earned its reputation not by being the most technically innovative PHP framework, but
        by being the most enjoyable one. It made opinionated choices — service providers, Eloquent's
        Active Record, artisan generators, facades — and it made them consistently. A developer who
        learned one part of Laravel could predict how every other part worked. Roost borrows this
        philosophy: strong conventions reduce the surface area of decisions developers have to make,
        and consistent patterns mean the framework's behavior is learnable rather than just
        discoverable through source code.
      </p>

      <h2>What Roost Adopts Directly</h2>
      <p>
        <strong>Service providers and the IoC container</strong> are the most direct inheritance.
        The two-phase <code>register()</code>/<code>boot()</code> lifecycle, the singleton/transient
        distinction, and the application bootstrap model all map closely to Laravel's. The semantics
        are the same even though the implementation is TypeScript and the runtime is a V8 isolate
        rather than a PHP-FPM process.
      </p>
      <p>
        <strong>Active Record via the ORM</strong> follows Eloquent's style: a <code>Model</code>
        class with static methods for querying (<code>User.find()</code>, <code>User.where()</code>)
        and instance methods for mutation (<code>user.save()</code>, <code>user.delete()</code>).
        Model hooks (<code>creating</code>, <code>created</code>, <code>updating</code>) mirror
        Eloquent's observer-like model events. Soft deletes, pagination, and eager loading are
        first-class features for the same reasons they are in Eloquent: they are universally needed
        and inconsistently implemented when left to application code.
      </p>
      <p>
        <strong>Middleware as a pipeline</strong> follows Laravel's HTTP middleware contract. Each
        middleware receives the request and a <code>next</code> handler, can modify the request
        before passing it on, and can modify the response on the way back. The composability is the
        same; the implementation uses the Web Platform <code>Request</code>/<code>Response</code>
        types instead of Symfony's HTTP Foundation.
      </p>
      <p>
        <strong>Artisan-style code generation</strong> is the model for <code>@roost/cli</code>.
        The philosophy — generate a file once, own it forever — means the generated code is not
        a locked-down black box but a starting point you modify freely.
      </p>

      <h2>What Roost Deliberately Changes</h2>
      <p>
        <strong>No facades.</strong> Laravel facades provide static-looking access to services
        that are actually resolved from the container at call time. In PHP, this works cleanly
        because PHP's <code>__callStatic</code> allows runtime method dispatch. In TypeScript,
        static-looking APIs are just static methods — there is no equivalent mechanism. More
        importantly, facades make dependency tracing harder: you cannot easily see from a function
        signature what it depends on. Roost uses explicit container resolution and constructor
        injection instead.
      </p>
      <p>
        <strong>TypeScript-first, not configuration arrays.</strong> Laravel uses PHP arrays extensively
        — for migration definitions, model fillables, validation rules. Roost uses TypeScript classes
        and interfaces. A migration is a TypeScript file with typed up/down methods. Schema definitions
        use a fluent builder with type inference. This trades the brevity of array syntax for IDE
        support, refactoring safety, and compile-time error detection.
      </p>
      <p>
        <strong>No magic property access via <code>__get</code>.</strong> Eloquent models in PHP
        expose attributes as dynamic properties through PHP's <code>__get</code> magic. Roost's ORM
        uses a <code>Proxy</code> to forward property access to <code>model.attributes</code>, but
        the type system does not reflect this at the model class level. Typed attribute access is
        an area where the TypeScript/JavaScript model diverges from PHP's, and Roost does not
        try to paper over that gap with clever generics — it accepts the trade-off.
      </p>

      <h2>The DX Philosophy</h2>
      <p>
        "The Laravel of Cloudflare Workers" is not a marketing slogan — it is a constraint. It means
        that when there is a choice between two technically equivalent approaches, Roost chooses the
        one that feels more like Laravel. Convention over configuration. Generators over boilerplate.
        Explicit dependency graphs over hidden singletons. And when the Workers runtime makes a
        Laravel-identical approach impossible, Roost finds the closest equivalent that respects
        the runtime's actual constraints rather than pretending those constraints do not exist.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/service-container">Service Container — the DI and provider model in depth</a></li>
        <li><a href="/docs/concepts/orm">@roost/orm concepts — Active Record on D1</a></li>
        <li><a href="/docs/concepts/cli">@roost/cli concepts — code generation philosophy</a></li>
        <li><a href="https://laravel.com/docs/providers" target="_blank" rel="noopener noreferrer">Laravel Service Providers</a></li>
        <li><a href="https://laravel.com/docs/eloquent" target="_blank" rel="noopener noreferrer">Laravel Eloquent ORM</a></li>
      </ul>
    </DocLayout>
  );
}
