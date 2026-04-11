import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/orm')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/orm Guides" subtitle="Task-oriented instructions for models, migrations, querying, relationships, and testing.">

      <h2>How to define a model</h2>
      <p>Extend <code>Model</code>, set <code>tableName</code>, and configure optional flags for timestamps and soft deletes.</p>
      <CodeBlock title="src/models/Post.ts">{`import { Model } from '@roost/orm';

export class Post extends Model {
  static tableName = 'posts';
  static primaryKey = 'id';    // default
  static timestamps = true;    // adds created_at / updated_at
  static softDeletes = false;  // set true to use deleted_at instead of DELETE
}`}</CodeBlock>
      <p>Access attributes via the <code>attributes</code> proxy: <code>post.attributes.title</code>. Do not add TypeScript instance properties — the proxy handles attribute access dynamically.</p>

      <h2>How to write and run migrations</h2>
      <p>Create a migration file in <code>database/migrations/</code> using <code>roost make:migration</code>, then run it with <code>roost migrate</code>.</p>
      <CodeBlock title="terminal">{`roost make:migration create_posts_table
roost migrate`}</CodeBlock>
      <CodeBlock title="database/migrations/0001_create_posts_table.ts">{`import { Migration } from '@roost/orm';

export default class CreatePostsTable extends Migration {
  async up(): Promise<void> {
    await this.db.run(\`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        body TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    \`);
  }

  async down(): Promise<void> {
    await this.db.run('DROP TABLE IF EXISTS posts');
  }
}`}</CodeBlock>
      <p>See <a href="/docs/guides/migrations">the migrations guide</a> for the full column reference and rollback patterns.</p>

      <h2>How to query with the QueryBuilder</h2>
      <p>Chain query methods on model static calls. All queries are lazy — execute with <code>.all()</code>, <code>.first()</code>, or <code>.count()</code>.</p>
      <CodeBlock>{`import { Post } from '../models/Post';

// Simple equality
const published = await Post.where('status', 'published').all();

// Operators
const recent = await Post.where('created_at', '>', lastWeek).all();

// Multiple conditions (AND)
const userPosts = await Post
  .where('author_id', userId)
  .where('status', 'published')
  .orderBy('created_at', 'desc')
  .limit(10)
  .all();

// OR conditions
const visible = await Post
  .where('status', 'published')
  .orWhere('author_id', currentUserId)
  .all();

// IN clause
const archived = await Post.whereIn('status', ['archived', 'deleted']).all();

// NULL checks
const drafts = await Post.whereNull('published_at').all();

// Single record
const post = await Post.where('slug', 'hello-world').firstOrFail();

// Count
const total = await Post.where('author_id', userId).count();`}</CodeBlock>

      <h2>How to define relationships between models</h2>
      <p>Declare relationships as static method calls. They are lazy-loaded — call the method on an instance to fetch related records.</p>
      <CodeBlock title="src/models/User.ts">{`import { Model } from '@roost/orm';
import { Post } from './Post';
import { Profile } from './Profile';
import { Role } from './Role';

export class User extends Model {
  static tableName = 'users';

  // One user has many posts
  static hasMany(Post, 'author_id', 'id');

  // One user has one profile
  static hasOne(Profile, 'user_id', 'id');

  // User belongs to many roles via pivot table
  static belongsToMany(Role, 'user_roles', 'user_id', 'id', 'role_id', 'id');
}`}</CodeBlock>
      <CodeBlock title="src/models/Post.ts">{`import { Model } from '@roost/orm';
import { User } from './User';

export class Post extends Model {
  static tableName = 'posts';

  // Each post belongs to one user
  static belongsTo(User, 'author_id', 'id');
}

// Usage
const post = await Post.findOrFail(1);
const author = await post.author(); // User instance
const posts = await (await User.findOrFail(1)).posts(); // Post[]`}</CodeBlock>

      <h2>How to use lifecycle hooks</h2>
      <p>Register hooks via <code>Model.on(event, callback)</code>. Return <code>false</code> from a <code>creating</code> or <code>updating</code> hook to abort the operation.</p>
      <CodeBlock title="src/models/Post.ts">{`import { Model } from '@roost/orm';

export class Post extends Model {
  static tableName = 'posts';
}

// Generate slug before insert
Post.on('creating', (post) => {
  if (!post.attributes.slug) {
    post.attributes.slug = post.attributes.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
});

// Abort if title is missing
Post.on('creating', (post) => {
  if (!post.attributes.title?.trim()) {
    return false; // Aborts the insert
  }
});

// Log updates for audit trail
Post.on('updated', (post) => {
  console.log(\`Post \${post.attributes.id} updated at \${new Date().toISOString()}\`);
});`}</CodeBlock>

      <h2>How to seed the database</h2>
      <p>Create seeder files in <code>database/seeders/</code> and run them with <code>roost db:seed</code>.</p>
      <CodeBlock title="database/seeders/UserSeeder.ts">{`import { Seeder } from '@roost/orm';
import { User } from '../../src/models/User';

export default class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await User.create({ name: 'Alice Admin', email: 'alice@example.com', role: 'admin' });
    await User.create({ name: 'Bob User', email: 'bob@example.com', role: 'user' });
  }
}`}</CodeBlock>
      <CodeBlock title="terminal">{`roost db:seed`}</CodeBlock>

      <h2>How to use factories in tests</h2>
      <p>Define a factory for a model and use it in tests to create records without specifying every attribute.</p>
      <CodeBlock title="database/factories/PostFactory.ts">{`import { Factory } from '@roost/orm';
import { Post } from '../../src/models/Post';

export const PostFactory = new Factory(Post, () => ({
  title: 'Test Post ' + Math.random().toString(36).slice(2),
  slug: 'test-post-' + Math.random().toString(36).slice(2),
  body: 'Lorem ipsum dolor sit amet.',
  author_id: 1,
  status: 'published',
}));`}</CodeBlock>
      <CodeBlock title="tests/posts.test.ts">{`import { PostFactory } from '../database/factories/PostFactory';

it('lists published posts', async () => {
  await PostFactory.create({ status: 'published' });
  await PostFactory.create({ status: 'draft' });

  const published = await Post.where('status', 'published').all();
  expect(published.length).toBe(1);
});`}</CodeBlock>

      <h2>How to paginate query results</h2>
      <p>Call <code>.paginate(page, perPage)</code> on any query chain. The result includes the data and metadata needed for pagination UI.</p>
      <CodeBlock>{`const page = Number(new URL(request.url).searchParams.get('page') || '1');

const result = await Post
  .where('status', 'published')
  .orderBy('created_at', 'desc')
  .paginate(page, 20);

// result.data       — Post[] for this page
// result.total      — total matching records
// result.perPage    — 20
// result.currentPage — current page number
// result.lastPage   — total pages

return Response.json({
  posts: result.data.map((p) => p.attributes),
  pagination: {
    current: result.currentPage,
    total: result.lastPage,
    count: result.total,
  },
});`}</CodeBlock>

    </DocLayout>
  );
}
