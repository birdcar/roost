import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/start')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/start Guides" subtitle="Task-oriented instructions for routing, server functions, and SSR with TanStack Start.">

      <h2>How to create a new route</h2>
      <p>Routes in TanStack Start are file-based. Create a file under <code>src/routes/</code> and export a <code>Route</code> using <code>createFileRoute</code>.</p>
      <CodeBlock title="src/routes/posts/$id.tsx">{`import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/posts/$id')({
  component: PostPage,
});

function PostPage() {
  const { id } = Route.useParams();
  return <div>Post: {id}</div>;
}`}</CodeBlock>
      <p>For API endpoints, use a loader or server function rather than returning HTML from the component. Nested routes inherit the parent layout automatically.</p>
      <CodeBlock title="src/routes/posts/index.tsx">{`import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/posts/')({
  loader: async () => {
    return await fetchPosts();
  },
  component: PostsPage,
});

function PostsPage() {
  const posts = Route.useLoaderData();
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          <Link to="/posts/$id" params={{ id: post.id }}>{post.title}</Link>
        </li>
      ))}
    </ul>
  );
}`}</CodeBlock>

      <h2>How to use server functions</h2>
      <p>Use <code>roostFn</code> for server functions that read data, and <code>roostFnWithInput</code> when the function accepts typed user input.</p>
      <CodeBlock title="src/functions/posts.ts">{`import { roostFn, roostFnWithInput } from '@roost/start';
import { roostMiddleware } from '../middleware';

// No input — read-only server function
export const listPosts = roostFn(roostMiddleware, async (roost) => {
  const postService = roost.container.resolve(PostService);
  return postService.findAll();
});

// Typed input — mutation server function
export const createPost = roostFnWithInput(
  roostMiddleware,
  (d: { title: string; body: string }) => d,
  async (roost, input) => {
    const postService = roost.container.resolve(PostService);
    return postService.create(input);
  }
);`}</CodeBlock>
      <CodeBlock title="src/routes/posts/new.tsx">{`import { createFileRoute } from '@tanstack/react-router';
import { createPost } from '../../functions/posts';

export const Route = createFileRoute('/posts/new')({ component: NewPostPage });

function NewPostPage() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await createPost({ title: form.get('title') as string, body: form.get('body') as string });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" />
      <textarea name="body" placeholder="Body" />
      <button type="submit">Publish</button>
    </form>
  );
}`}</CodeBlock>

      <h2>How to access the Roost container from routes</h2>
      <p>Use <code>createRoostMiddleware</code> to bootstrap your application and expose the container via the <code>roost</code> context in server functions and loaders.</p>
      <CodeBlock title="src/middleware.ts">{`import { createRoostMiddleware } from '@roost/start';
import { Application } from '@roost/core';
import { CloudflareServiceProvider } from '@roost/cloudflare';
import { AuthServiceProvider } from '@roost/auth';

export const roostMiddleware = createRoostMiddleware(() => {
  const app = new Application({});
  app.register(CloudflareServiceProvider);
  app.register(AuthServiceProvider);
  return app;
});`}</CodeBlock>
      <CodeBlock title="src/functions/users.ts">{`import { roostFn } from '@roost/start';
import { roostMiddleware } from '../middleware';

export const getCurrentUser = roostFn(roostMiddleware, async (roost) => {
  // roost.container gives you the fully-booted DI container
  const userService = roost.container.resolve(UserService);
  return userService.getCurrentUser(roost.request);
});`}</CodeBlock>

      <h2>How to configure SSR</h2>
      <p>SSR is enabled by default in TanStack Start. Configure it in <code>app.config.ts</code>. For streaming SSR, set <code>renderMode</code> to <code>'stream'</code>.</p>
      <CodeBlock title="app.config.ts">{`import { defineConfig } from '@tanstack/start/config';

export default defineConfig({
  server: {
    preset: 'cloudflare-pages',
  },
  routers: {
    ssr: {
      entry: './src/entry.server.tsx',
    },
    client: {
      entry: './src/entry.client.tsx',
    },
  },
});`}</CodeBlock>
      <p>To opt a route out of SSR and render it client-only, use the <code>clientOnly</code> loader modifier from TanStack Start. See <a href="https://tanstack.com/start/latest/docs/framework/react/ssr">TanStack Start SSR docs</a> for streaming and hydration options.</p>

    </DocLayout>
  );
}
