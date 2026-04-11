import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../components/doc-layout';
import { CodeBlock } from '../../components/code-block';
import { Callout } from '../../components/callout';

export const Route = createFileRoute('/docs/getting-started')({
  component: GettingStartedPage,
});

function GettingStartedPage() {
  return (
    <DocLayout
      title="Quick Start"
      subtitle="Install the CLI, create a project, and deploy your first Roost application."
    >
      <Callout type="tip">
        <p><strong>What you'll do:</strong> Install the Roost CLI, scaffold a project, add a route, create a database model, add authentication, and deploy — all in about 15 minutes.</p>
        <p><strong>Prerequisites:</strong> <a href="https://bun.sh">Bun 1.0+</a>, a <a href="https://dash.cloudflare.com/sign-up">Cloudflare account</a> (free tier), and a <a href="https://workos.com">WorkOS account</a> (free tier).</p>
      </Callout>

      <h2>Step 1: Install the Roost CLI</h2>
      <p>Install the CLI globally with Bun:</p>
      <CodeBlock title="terminal">{`bun add -g @roost/cli`}</CodeBlock>
      <p>Verify the installation:</p>
      <CodeBlock title="terminal">{`roost --version`}</CodeBlock>
      <p>You should see a version number like <code>1.0.0</code>. If the command isn't found, make sure Bun's global bin directory is on your <code>PATH</code>.</p>

      <h2>Step 2: Create Your Project</h2>
      <p>Scaffold a new Roost application:</p>
      <CodeBlock title="terminal">{`roost new my-app
cd my-app
bun install`}</CodeBlock>
      <p>You should see the CLI generate a project structure and install dependencies. This takes a few seconds.</p>

      <h2>Step 3: Start the Dev Server</h2>
      <CodeBlock title="terminal">{`bun run dev`}</CodeBlock>
      <p>You should see output indicating the dev server is running. Open <code>http://localhost:3000</code> in your browser — you'll see the Roost welcome page.</p>

      <h2>Step 4: Create Your First Route</h2>
      <p>Create a new file at <code>src/routes/hello.tsx</code>:</p>
      <CodeBlock title="src/routes/hello.tsx">{`import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/hello')({
  component: HelloPage,
});

function HelloPage() {
  return (
    <div>
      <h1>Hello, Roost!</h1>
      <p>Your first route is working.</p>
    </div>
  );
}`}</CodeBlock>
      <p>Visit <code>http://localhost:3000/hello</code>. You should see "Hello, Roost!" displayed in the browser. The page appeared without restarting the server — TanStack Start picks up new route files automatically.</p>

      <h2>Step 5: Add a Database Model</h2>
      <p>Generate a model and its migration:</p>
      <CodeBlock title="terminal">{`roost make:model Post`}</CodeBlock>
      <p>This creates two files: <code>src/models/Post.ts</code> and a timestamped migration in <code>database/migrations/</code>. Edit the migration to define your schema:</p>
      <CodeBlock title="database/migrations/xxxx_create_posts_table.ts">{`import { Migration } from '@roost/orm';

export default class CreatePostsTable extends Migration {
  async up() {
    this.schema.create('posts', (table) => {
      table.id();
      table.string('title');
      table.text('body');
      table.timestamps();
    });
  }

  async down() {
    this.schema.drop('posts');
  }
}`}</CodeBlock>
      <p>Run the migration:</p>
      <CodeBlock title="terminal">{`roost migrate`}</CodeBlock>
      <p>You should see output confirming the <code>posts</code> table was created in your local D1 database.</p>

      <h2>Step 6: Query Your Model</h2>
      <p>Update your hello route to read from the database:</p>
      <CodeBlock title="src/routes/hello.tsx">{`import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/start';
import { Post } from '../models/Post';

const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return Post.query().orderBy('created_at', 'desc').all();
});

export const Route = createFileRoute('/hello')({
  component: HelloPage,
  loader: () => getPosts(),
});

function HelloPage() {
  const posts = Route.useLoaderData();
  return (
    <div>
      <h1>Posts</h1>
      {posts.length === 0 ? (
        <p>No posts yet.</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}`}</CodeBlock>
      <p>Visit <code>http://localhost:3000/hello</code>. You should see "No posts yet." — the model is connected to D1 and the query ran successfully.</p>

      <h2>Step 7: Add Authentication</h2>
      <p>Add your WorkOS credentials to <code>.dev.vars</code>:</p>
      <CodeBlock title=".dev.vars">{`WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...`}</CodeBlock>
      <Callout type="tip">
        <p>
          Never commit <code>.dev.vars</code> — it's in <code>.gitignore</code> by default.
        </p>
      </Callout>
      <p>Auth routes are available automatically once credentials are configured:</p>
      <CodeBlock>{`/auth/login      # Redirect to WorkOS
/auth/callback   # Handle OAuth callback
/auth/logout     # Clear session`}</CodeBlock>
      <p>Visit <code>http://localhost:3000/auth/login</code>. You should be redirected to the WorkOS login page. After authenticating, you'll be redirected back to your app. To protect a route, add <code>AuthMiddleware</code> — see the <a href="/docs/guides/auth">auth guides</a> for details.</p>

      <h2>Step 8: Deploy</h2>
      <CodeBlock title="terminal">{`roost deploy`}</CodeBlock>
      <p>You should see the build output followed by a live URL on <code>*.workers.dev</code>. Your app is now running on Cloudflare Workers at the edge. Set production secrets in your <a href="https://dash.cloudflare.com">Cloudflare dashboard</a> under Workers &gt; Settings &gt; Variables.</p>

      <h2>What You Built</h2>
      <p>
        You installed the Roost CLI, scaffolded a project, created a route, added a database model
        with a migration, queried it from a page, configured authentication, and deployed to
        Cloudflare Workers. That's a full-stack app running at the edge.
      </p>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/tutorials/build-a-task-api">Build a REST API</a> — CRUD endpoints, validation, and testing</li>
        <li><a href="/docs/tutorials/build-a-chat-app">Build an AI Chat App</a> — agents, tools, and streaming on Workers AI</li>
        <li><a href="/docs/tutorials/build-a-saas-app">Build a SaaS App</a> — auth, billing, and background jobs</li>
        <li><a href="/docs/reference/core">@roost/core Reference</a> — service container, config, and middleware</li>
        <li><a href="/docs/concepts/architecture">Architecture Concepts</a> — understand how Roost works under the hood</li>
      </ul>
    </DocLayout>
  );
}
