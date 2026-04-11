import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/orm')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/orm</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Laravel-like model classes wrapping Drizzle ORM for D1 databases. Query builder, relationships, migrations, factories.</p>

      <h2>Defining Models</h2>
      <pre><code>{`import { Model } from '@roost/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

class Post extends Model {
  static tableName = 'posts';
  static columns = {
    title: text('title').notNull(),
    body: text('body').notNull(),
    author_id: integer('author_id').notNull(),
  };
}`}</code></pre>

      <h2>Query Builder</h2>
      <pre><code>{`const posts = await Post.where('author_id', userId).all();
const post = await Post.find(1);
const recent = await Post
  .where('created_at', '>', lastWeek)
  .orderBy('created_at', 'desc')
  .limit(10)
  .all();
const { data, total } = await Post.where('author_id', userId).paginate(1, 20);`}</code></pre>

      <h2>CRUD</h2>
      <pre><code>{`const post = await Post.create({ title: 'Hello', body: '...', author_id: 1 });
await post.save();
await post.delete();`}</code></pre>

      <h2>Lifecycle Hooks</h2>
      <pre><code>{`Post.on('creating', (post) => {
  // Validate, transform, or abort (return false)
});`}</code></pre>
    </div>
  );
}
