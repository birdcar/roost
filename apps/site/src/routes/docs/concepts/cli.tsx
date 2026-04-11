import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/cli')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/cli" subtitle="The code generation philosophy behind Roost's generators, how scaffolding reduces decision fatigue, and convention enforcement through generators.">
      <h2>Generate Once, Own Forever</h2>
      <p>
        Some frameworks generate code that you are not supposed to modify — it is owned by the
        framework and regenerated on every update. Roost takes the opposite position. When you
        run <code>roost make:model User</code>, the generated <code>User.ts</code> is yours.
        You can add methods, override defaults, change column types. The generator is a starting
        point, not a contract that you maintain by keeping the file in sync with a hidden template.
      </p>
      <p>
        This philosophy is inherited directly from Laravel's Artisan. <code>artisan make:model</code>
        generates a file and steps aside. The generated code follows conventions, but the developer
        owns it. For Roost, this means generators can be intentionally simple — they need to
        produce good starting-point code, not complete implementations that cover every possible
        option through flags and conditionals.
      </p>

      <h2>Decision Fatigue and Scaffolding</h2>
      <p>
        Blank files invite endless bikeshedding: where should this file go? What should it be
        named? Should the class extend something? What imports are needed? For experienced
        developers, these questions have obvious answers, but they still take time to answer
        and create cognitive overhead. For developers new to Roost (or new to a team using Roost),
        they create confusion.
      </p>
      <p>
        Generators answer all of these questions by default. Running <code>roost make:job SendWelcomeEmail</code>
        creates the file at the right path, names the class correctly, extends the right base class,
        and includes the necessary imports. The developer can start writing the job's <code>handle()</code>
        method immediately, with zero setup overhead. This is the practical value of opinionated
        generators: they eliminate the non-problems so developers can focus on the actual problem.
      </p>

      <h2>Convention Enforcement Through Generators</h2>
      <p>
        Generators also enforce conventions consistently across a team. If every developer on a
        team generates models the same way, models will follow the same structure, live in the
        same directory, and use the same naming conventions. This is more reliable than a style
        guide document that everyone is supposed to read and remember.
      </p>
      <p>
        The generator templates are EJS files inside the CLI package. For teams with specific
        conventions beyond Roost's defaults, the templates are the right place to make changes —
        modifying them once changes every future generated file, rather than requiring every
        developer to remember a custom pattern.
      </p>

      <h2>No Runtime Dependencies</h2>
      <p>
        The CLI runs in Node.js, not in a Cloudflare Worker. It reads and writes files on the
        local filesystem — things that Workers cannot do. This is not a design inconsistency;
        it is the correct tool for the job. Code generation is a development-time operation that
        belongs on the developer's machine. The generated files are what run in Workers. The
        CLI is never part of the deployed bundle.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/laravel-patterns">Laravel Patterns — Artisan as the inspiration for Roost's CLI model</a></li>
        <li><a href="/docs/packages/cli">@roost/cli reference — available generators and their options</a></li>
      </ul>
    </DocLayout>
  );
}
