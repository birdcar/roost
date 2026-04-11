import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/start')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/start" subtitle="Why Roost integrates with TanStack Start, how the context bridge connects server and client, and what SSR looks like on Workers.">
      <h2>Why TanStack Start Over Next.js or Remix</h2>
      <p>
        The React full-stack framework space has several contenders. Next.js is the most widely
        deployed. Remix prioritizes web fundamentals. Both are designed primarily for Node.js
        and have varying levels of support for edge runtimes. TanStack Start is different in a
        relevant way: it is runtime-agnostic at its core and designed to run on Cloudflare Workers
        as a first-class deployment target, not as an afterthought.
      </p>
      <p>
        More concretely, TanStack Start's routing model is file-based but builds on TanStack Router,
        which has some of the strongest TypeScript integration of any React router. Route params
        are typed. Loader data is typed. Search params are validated and typed. For applications that
        take TypeScript seriously, this type safety propagates from the URL into the component tree
        without manual casting. That alignment with Roost's TypeScript-first design made TanStack
        Start the right foundation.
      </p>

      <h2>The Context Bridge</h2>
      <p>
        Roost runs server-side: it boots, registers providers, and makes services available through
        the container. TanStack Start runs server-side rendering and client-side hydration. The
        challenge is connecting these two systems so that server functions and route loaders can
        access Roost's container — the authenticated user, resolved organization, database
        connection — without the container being globally mutable state.
      </p>
      <p>
        The <code>@roost/start</code> package solves this with a context bridge. The Roost
        <code>Application</code> is bootstrapped once and cached. For each request, a scoped
        container is created and attached to TanStack Start's server context. Server functions
        defined with <code>roostFn</code> capture this context and can resolve services from it.
        The bridge is the mechanism that makes the scoped container travel through TanStack Start's
        data-loading layer without being a global singleton.
      </p>

      <h2>SSR on Workers vs. Node.js</h2>
      <p>
        Server-side rendering in Node.js typically means a long-running process that handles
        React's <code>renderToString</code> or streaming equivalents. On Workers, there is no
        persistent server process — each request is handled fresh (possibly by a warm isolate,
        but without server-process-level assumptions). This means SSR happens per-request,
        which is actually the semantically correct behavior for dynamic applications: every
        visitor gets a server render reflecting the current server state, not a stale render
        from a warm cache.
      </p>
      <p>
        The Workers runtime includes V8's streaming APIs, so TanStack Start's streaming SSR works
        natively. The main practical difference from Node.js is that Workers do not have Node.js
        built-ins, so any SSR code or its dependencies must be compatible with the Web Platform
        APIs. TanStack Start is designed for this; Roost's integration does not paper over
        any incompatibilities.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/architecture">Application Architecture — how start integrates with the Roost request lifecycle</a></li>
        <li><a href="/docs/concepts/edge-computing">Edge Computing — the Workers runtime and SSR implications</a></li>
        <li><a href="/docs/packages/start">@roost/start reference — bootApp, roostFn, and provider API</a></li>
        <li><a href="https://tanstack.com/start" target="_blank" rel="noopener noreferrer">TanStack Start Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
