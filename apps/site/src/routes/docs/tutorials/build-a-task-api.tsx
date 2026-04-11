import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';
import { Callout } from '../../../components/callout';

export const Route = createFileRoute('/docs/tutorials/build-a-task-api')({
  component: BuildATaskApiPage,
});

function BuildATaskApiPage() {
  return (
    <DocLayout
      title="Build a REST API"
      subtitle="Create a CRUD API with database models, validation, and tests."
    >
      <Callout type="note">
        <p><strong>What you'll learn</strong></p>
        <ul>
          <li>Defining ORM models with migrations and typed columns</li>
          <li>Using QueryBuilder for filtering, sorting, and pagination</li>
          <li>Validating request input with the schema builder</li>
          <li>Writing end-to-end API tests with <code>TestClient</code></li>
          <li>Adding model relationships and protecting routes with <code>AuthMiddleware</code></li>
        </ul>
        <p><strong>Estimated time:</strong> ~35 minutes</p>
        <p>
          <strong>Prerequisites:</strong> Complete the{' '}
          <a href="/docs/getting-started">Quick Start</a> guide before starting.
        </p>
        <p>
          <strong>Packages used:</strong>{' '}
          <a href="/docs/packages/orm">@roost/orm</a>,{' '}
          <a href="/docs/packages/core">@roost/core</a>,{' '}
          <a href="/docs/packages/testing">@roost/testing</a>,{' '}
          <a href="/docs/packages/start">@roost/start</a>
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 1: Create the project</h2>
      <p>
        Scaffold a new Roost application called <code>task-api</code>, then install
        its dependencies.
      </p>
      <CodeBlock title="terminal">
        {`roost new task-api
cd task-api
bun install`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          You should see output like <code>✓ task-api created successfully</code> followed
          by Bun resolving and installing the workspace packages.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 2: Create the Task model</h2>
      <p>
        Generate a model named <code>Task</code>. The CLI creates both a model class
        at <code>src/models/Task.ts</code> and a timestamped migration file inside
        <code>database/migrations/</code>.
      </p>
      <CodeBlock title="terminal">
        {`roost make:model Task`}
      </CodeBlock>
      <p>
        Open the generated migration and replace the placeholder column definitions
        with the schema for our task:
      </p>
      <CodeBlock title="database/migrations/XXXX_create_tasks_table.ts">
        {`import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status', { enum: ['pending', 'in_progress', 'done'] })
                 .notNull()
                 .default('pending'),
  due_date:    text('due_date'),   // ISO-8601 date string, nullable
  created_at:  text('created_at'),
  updated_at:  text('updated_at'),
});`}
      </CodeBlock>
      <p>
        Now open <code>src/models/Task.ts</code> and point the model at the table
        you just defined:
      </p>
      <CodeBlock title="src/models/Task.ts">
        {`import { Model } from '@roost/orm';
import { tasks } from '../../database/migrations/XXXX_create_tasks_table';

export class Task extends Model {
  static tableName = 'tasks';
  static _table    = tasks;
}`}
      </CodeBlock>
      <p>Apply the migration to your local D1 database:</p>
      <CodeBlock title="terminal">
        {`roost migrate`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          You should see <code>Migrations applied successfully</code>. If you open
          Wrangler's local D1 studio (<code>bunx wrangler d1 execute task-api --local
          --command "SELECT name FROM sqlite_master WHERE type='table';"</code>) you
          will see the <code>tasks</code> table listed.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 3: Create GET /api/tasks</h2>
      <p>
        Create the index route. It fetches all tasks from the database and returns
        them as JSON.
      </p>
      <CodeBlock title="src/routes/api/tasks/index.ts">
        {`import { createAPIFileRoute } from '@tanstack/start/api';
import { Task } from '../../../models/Task';

export const APIRoute = createAPIFileRoute('/api/tasks')({
  GET: async () => {
    const tasks = await Task.all();
    return Response.json(tasks.map((t) => t.attributes));
  },
});`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Start the dev server (<code>bun run dev</code>) and visit{' '}
          <code>http://localhost:3000/api/tasks</code>. You should see an empty
          JSON array: <code>[]</code>.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 4: Create POST /api/tasks</h2>
      <p>
        Add the <code>POST</code> handler to the same route file. We parse the request
        body, validate the required fields, and persist the new task.
      </p>
      <CodeBlock title="src/routes/api/tasks/index.ts">
        {`import { createAPIFileRoute } from '@tanstack/start/api';
import { z } from 'zod';
import { Task } from '../../../models/Task';

const createTaskSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'done']).default('pending'),
  due_date:    z.string().optional(),
});

export const APIRoute = createAPIFileRoute('/api/tasks')({
  GET: async () => {
    const tasks = await Task.all();
    return Response.json(tasks.map((t) => t.attributes));
  },

  POST: async ({ request }) => {
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.flatten() }, { status: 422 });
    }

    const task = await Task.create(parsed.data);
    return Response.json(task.attributes, { status: 201 });
  },
});`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Test with curl:
        </p>
        <code>
          {`curl -s -X POST http://localhost:3000/api/tasks \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Buy groceries"}' | jq .`}
        </code>
        <p>
          You should see the newly created task object with an <code>id</code>,
          <code>status: "pending"</code>, and ISO timestamps.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 5: Create PUT /api/tasks/:id</h2>
      <p>
        Create a separate file for the parameterised route. TanStack Start uses
        filename brackets for path parameters.
      </p>
      <CodeBlock title="src/routes/api/tasks/$id.ts">
        {`import { createAPIFileRoute } from '@tanstack/start/api';
import { z } from 'zod';
import { Task } from '../../../models/Task';

const updateTaskSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'done']).optional(),
  due_date:    z.string().optional(),
});

export const APIRoute = createAPIFileRoute('/api/tasks/$id')({
  PUT: async ({ params, request }) => {
    const task = await Task.find(Number(params.id));
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.flatten() }, { status: 422 });
    }

    Object.assign(task.attributes, parsed.data);
    await task.save();

    return Response.json(task.attributes);
  },
});`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Replace <code>1</code> with the <code>id</code> returned by your POST
          call, then run:
        </p>
        <code>
          {`curl -s -X PUT http://localhost:3000/api/tasks/1 \\
  -H 'Content-Type: application/json' \\
  -d '{"status":"in_progress"}' | jq .status`}
        </code>
        <p>You should see <code>"in_progress"</code>.</p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 6: Create DELETE /api/tasks/:id</h2>
      <p>
        Add a <code>DELETE</code> handler to the same <code>$id.ts</code> file.
      </p>
      <CodeBlock title="src/routes/api/tasks/$id.ts (updated)">
        {`import { createAPIFileRoute } from '@tanstack/start/api';
import { z } from 'zod';
import { Task } from '../../../models/Task';

const updateTaskSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'done']).optional(),
  due_date:    z.string().optional(),
});

export const APIRoute = createAPIFileRoute('/api/tasks/$id')({
  PUT: async ({ params, request }) => {
    const task = await Task.find(Number(params.id));
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.flatten() }, { status: 422 });
    }

    Object.assign(task.attributes, parsed.data);
    await task.save();

    return Response.json(task.attributes);
  },

  DELETE: async ({ params }) => {
    const task = await Task.find(Number(params.id));
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    await task.delete();
    return new Response(null, { status: 204 });
  },
});`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Run <code>curl -s -o /dev/null -w "%{'{'}http_code{'}'}" -X DELETE
          http://localhost:3000/api/tasks/1</code> — you should get back{' '}
          <code>204</code>.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 7: Add filtering and sorting</h2>
      <p>
        Update the <code>GET /api/tasks</code> handler to accept optional
        <code>status</code> and <code>sort</code> query parameters using
        QueryBuilder's <code>where</code> and <code>orderBy</code> methods.
      </p>
      <CodeBlock title="src/routes/api/tasks/index.ts (updated GET handler)">
        {`GET: async ({ request }) => {
  const url    = new URL(request.url);
  const status = url.searchParams.get('status');
  const sort   = url.searchParams.get('sort') ?? 'created_at';
  const order  = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

  let query = Task.where('id', '>', 0);   // start a QueryBuilder

  if (status) {
    query = query.where('status', status);
  }

  query = query.orderBy(sort, order);

  const tasks = await query.all();
  return Response.json(tasks.map((t) => t.attributes));
},`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          Create a few tasks with different statuses, then try:
        </p>
        <code>
          {`curl "http://localhost:3000/api/tasks?status=pending&sort=due_date&order=asc"`}
        </code>
        <p>Only pending tasks should appear, ordered by due date ascending.</p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 8: Write tests with TestClient</h2>
      <p>
        Create a test file that covers every endpoint. <code>setupTestSuite</code>
        boots the application once per suite and gives you a pre-configured
        <code>TestClient</code>.
      </p>
      <CodeBlock title="tests/tasks.test.ts">
        {`import { describe, it, beforeAll, afterAll } from 'bun:test';
import { setupTestSuite } from '@roost/testing';

const suite = setupTestSuite();

beforeAll(suite.beforeAll);
afterAll(suite.afterAll);

describe('GET /api/tasks', () => {
  it('returns an empty array when no tasks exist', async () => {
    const { client } = suite.getContext();
    const res = await client.get('/api/tasks');
    res.assertOk();
    const data = await res.json<unknown[]>();
    if (!Array.isArray(data) || data.length !== 0) {
      throw new Error('Expected empty array');
    }
  });
});

describe('POST /api/tasks', () => {
  it('creates a task with valid input', async () => {
    const { client } = suite.getContext();
    const res = await client.post('/api/tasks', { title: 'Write tests' });
    res.assertCreated();
    await res.assertJson({ title: 'Write tests', status: 'pending' });
  });

  it('returns 422 when title is missing', async () => {
    const { client } = suite.getContext();
    const res = await client.post('/api/tasks', { description: 'No title here' });
    res.assertStatus(422);
  });
});

describe('PUT /api/tasks/:id', () => {
  it('updates an existing task', async () => {
    const { client } = suite.getContext();

    const created = await client.post('/api/tasks', { title: 'Original title' });
    created.assertCreated();
    const task = await created.json<{ id: number }>();

    const updated = await client.put(\`/api/tasks/\${task.id}\`, {
      status: 'in_progress',
    });
    updated.assertOk();
    await updated.assertJson({ status: 'in_progress' });
  });

  it('returns 404 for a non-existent task', async () => {
    const { client } = suite.getContext();
    const res = await client.put('/api/tasks/99999', { title: 'Ghost' });
    res.assertNotFound();
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes an existing task', async () => {
    const { client } = suite.getContext();

    const created = await client.post('/api/tasks', { title: 'To be deleted' });
    created.assertCreated();
    const task = await created.json<{ id: number }>();

    const deleted = await client.delete(\`/api/tasks/\${task.id}\`);
    deleted.assertNoContent();
  });

  it('returns 404 when deleting a non-existent task', async () => {
    const { client } = suite.getContext();
    const res = await client.delete('/api/tasks/99999');
    res.assertNotFound();
  });
});`}
      </CodeBlock>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 9: Run the tests</h2>
      <CodeBlock title="terminal">
        {`bun test`}
      </CodeBlock>
      <Callout type="tip">
        <p>You should see output similar to:</p>
        <CodeBlock>
          {`bun test v1.x

tests/tasks.test.ts:
  GET /api/tasks
    ✓ returns an empty array when no tasks exist
  POST /api/tasks
    ✓ creates a task with valid input
    ✓ returns 422 when title is missing
  PUT /api/tasks/:id
    ✓ updates an existing task
    ✓ returns 404 for a non-existent task
  DELETE /api/tasks/:id
    ✓ deletes an existing task
    ✓ returns 404 when deleting a non-existent task

7 pass, 0 fail`}
        </CodeBlock>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 10: Add User hasMany Tasks relationship</h2>
      <p>
        Add a <code>user_id</code> foreign key column to the migration and expose
        the relationship on the <code>Task</code> model using
        <code>HasManyRelation</code> (declared on the parent) and
        <code>BelongsToRelation</code> (declared on the child).
      </p>
      <p>First, add the column to your migration:</p>
      <CodeBlock title="database/migrations/XXXX_create_tasks_table.ts (updated)">
        {`import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  user_id:     integer('user_id'),            // foreign key — nullable for now
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status', { enum: ['pending', 'in_progress', 'done'] })
                 .notNull()
                 .default('pending'),
  due_date:    text('due_date'),
  created_at:  text('created_at'),
  updated_at:  text('updated_at'),
});`}
      </CodeBlock>
      <p>Re-run migrations to apply the change:</p>
      <CodeBlock title="terminal">
        {`roost migrate`}
      </CodeBlock>
      <p>
        Now declare the relationship on the <code>Task</code> model using
        <code>BelongsToRelation</code>, and add the inverse <code>HasManyRelation</code>
        to the <code>User</code> model:
      </p>
      <CodeBlock title="src/models/Task.ts (updated)">
        {`import { Model, BelongsToRelation } from '@roost/orm';
import { tasks } from '../../database/migrations/XXXX_create_tasks_table';

export class Task extends Model {
  static tableName = 'tasks';
  static _table    = tasks;

  // Lazy import avoids circular-dependency issues at module load time.
  static user() {
    const { User } = require('./User');
    return new BelongsToRelation(User, 'user_id');
  }
}`}
      </CodeBlock>
      <CodeBlock title="src/models/User.ts (updated)">
        {`import { Model, HasManyRelation } from '@roost/orm';
import { users } from '../../database/migrations/XXXX_create_users_table';
import { Task } from './Task';

export class User extends Model {
  static tableName = 'users';
  static _table    = users;

  static tasks() {
    return new HasManyRelation(Task, 'user_id');
  }
}`}
      </CodeBlock>
      <p>
        To load a user's tasks in a route you can call the relation directly:
      </p>
      <CodeBlock title="example usage">
        {`const user = await User.findOrFail(userId);
const tasks = await User.tasks().load(user);`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          After updating the models and re-running migrations, running
          <code>bun run typecheck</code> should still pass with zero errors.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>Step 11: Protect the API with AuthMiddleware</h2>
      <p>
        Import <code>AuthMiddleware</code> from <code>@roost/auth</code> and apply
        it to both route files. Unauthenticated requests will receive a
        <code>401 Unauthorized</code> response before they reach your handler.
      </p>
      <CodeBlock title="src/routes/api/tasks/index.ts (add middleware)">
        {`import { createAPIFileRoute } from '@tanstack/start/api';
import { z } from 'zod';
import { AuthMiddleware } from '@roost/auth';
import { Task } from '../../../models/Task';

const createTaskSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'done']).default('pending'),
  due_date:    z.string().optional(),
});

export const APIRoute = createAPIFileRoute('/api/tasks')({
  middleware: [AuthMiddleware],

  GET: async ({ request }) => {
    const url    = new URL(request.url);
    const status = url.searchParams.get('status');
    const sort   = url.searchParams.get('sort') ?? 'created_at';
    const order  = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

    let query = Task.where('id', '>', 0);

    if (status) {
      query = query.where('status', status);
    }

    query = query.orderBy(sort, order);

    const tasks = await query.all();
    return Response.json(tasks.map((t) => t.attributes));
  },

  POST: async ({ request }) => {
    const body   = await request.json();
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.flatten() }, { status: 422 });
    }

    const task = await Task.create(parsed.data);
    return Response.json(task.attributes, { status: 201 });
  },
});`}
      </CodeBlock>
      <p>
        In your tests, use <code>client.actingAs(user)</code> to inject a test user
        identity so authenticated endpoints continue to pass:
      </p>
      <CodeBlock title="tests/tasks.test.ts (acting as a user)">
        {`it('creates a task as an authenticated user', async () => {
  const { client } = suite.getContext();
  const res = await client
    .actingAs({ id: 'user_test_123' })
    .post('/api/tasks', { title: 'Auth task' });
  res.assertCreated();
});`}
      </CodeBlock>
      <Callout type="note">
        <p>
          The <code>x-test-user-id</code> header that <code>actingAs</code> sets is
          recognised by <code>AuthMiddleware</code> in test environments only.
          It has no effect in production.
        </p>
      </Callout>

      {/* ------------------------------------------------------------------ */}
      <h2>What you built</h2>
      <p>
        You now have a fully functional, tested REST API with:
      </p>
      <ul>
        <li>A <code>Task</code> model backed by a D1 SQLite migration</li>
        <li>Full CRUD — GET, POST, PUT, DELETE — with 422 and 404 error handling</li>
        <li>QueryBuilder-powered filtering (<code>where</code>) and sorting (<code>orderBy</code>)</li>
        <li>Zod validation on every write endpoint</li>
        <li>A <code>User hasMany Tasks</code> relationship</li>
        <li>Route-level authentication via <code>AuthMiddleware</code></li>
        <li>Seven passing tests using <code>TestClient</code> and its assertion helpers</li>
      </ul>

      <h2>Next steps</h2>
      <ul>
        <li>
          <a href="/docs/reference/orm">@roost/orm reference</a> — full API
          documentation for <code>Model</code>, <code>QueryBuilder</code>, and
          all relation types
        </li>
        <li>
          <a href="/docs/guides/orm">ORM guide</a> — pagination, soft deletes,
          model hooks, and eager loading
        </li>
        <li>
          <a href="/docs/concepts/orm">ORM concepts</a> — how the ORM maps to
          Drizzle and D1 under the hood
        </li>
      </ul>
    </DocLayout>
  );
}
