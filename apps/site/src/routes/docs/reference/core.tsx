import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/core')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/core" subtitle="Dependency injection container, configuration management, middleware pipeline, application lifecycle, and service provider base class.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/core`}</CodeBlock>

      <h2>RoostContainer API</h2>
      <p>
        <code>RoostContainer</code> is a lightweight dependency injection container. Tokens are class
        constructors or symbols. Bindings are factories that receive the container as their first argument.
      </p>

      <h4><code>singleton&lt;T&gt;(token: Token&lt;T&gt;, factory: Factory&lt;T&gt;): void</code></h4>
      <p>
        Register a singleton binding. The factory is called once on first resolution. The same
        instance is returned on every subsequent <code>resolve()</code> call for the same token.
      </p>

      <h4><code>bind&lt;T&gt;(token: Token&lt;T&gt;, factory: Factory&lt;T&gt;): void</code></h4>
      <p>
        Register a transient binding. The factory is called on every <code>resolve()</code> call,
        returning a new instance each time.
      </p>

      <h4><code>resolve&lt;T&gt;(token: Token&lt;T&gt;): T</code></h4>
      <p>
        Resolve a dependency. Throws <code>BindingNotFoundError</code> if no binding is registered
        for the token.
      </p>

      <h4><code>has(token: Token&lt;unknown&gt;): boolean</code></h4>
      <p>
        Returns <code>true</code> if a binding exists for the token. Searches parent containers
        in the scope chain.
      </p>

      <h4><code>scoped(): RoostContainer</code></h4>
      <p>
        Create a child container that inherits all bindings from the parent but maintains its
        own singleton registry. Used for request-level isolation.
      </p>

      <h4><code>flush(): void</code></h4>
      <p>
        Remove all bindings and resolved singleton instances from the container.
      </p>

      <h2>ConfigManager API</h2>
      <p>
        <code>ConfigManager</code> provides dot-notation access to nested configuration objects.
      </p>

      <h4><code>constructor(config?: Record&lt;string, unknown&gt;)</code></h4>
      <p>Create a new ConfigManager with optional initial configuration data.</p>

      <h4><code>get&lt;T&gt;(key: string, defaultValue?: T): T</code></h4>
      <p>
        Retrieve a value using dot-notation key (e.g., <code>'database.default'</code>).
        Throws <code>ConfigKeyNotFoundError</code> if the key does not exist and no default is provided.
      </p>

      <h4><code>set(key: string, value: unknown): void</code></h4>
      <p>Set a configuration value. Creates intermediate objects for nested keys as needed.</p>

      <h4><code>has(key: string): boolean</code></h4>
      <p>Returns <code>true</code> if the dot-notation key exists in the configuration.</p>

      <h4><code>mergeEnv(env: Record&lt;string, string | undefined&gt;): void</code></h4>
      <p>
        Merge environment variables into configuration. Variable names are lowercased and
        underscores converted to dots before matching against existing keys. Only merges
        if the key already exists in the configuration.
      </p>
      <CodeBlock>{`// APP_DEBUG=true merges into app.debug
// APP_NAME=x is ignored if app.name was not in the initial config
config.mergeEnv({ APP_DEBUG: 'true' });`}</CodeBlock>

      <h2>Pipeline API</h2>
      <p>
        <code>Pipeline</code> orchestrates ordered middleware execution. Each middleware
        receives a <code>Request</code> and a <code>next</code> function that calls
        the remaining middleware chain.
      </p>

      <h4><code>use(middleware: Middleware | MiddlewareClass, ...args: string[]): this</code></h4>
      <p>
        Add middleware to the pipeline. Supports plain functions and class-based middleware.
        Additional string arguments are passed to class middleware constructors.
        Returns <code>this</code> for chaining.
      </p>

      <h4><code>handle(request: Request, handler: Handler): Promise&lt;Response&gt;</code></h4>
      <p>
        Run the request through all registered middleware in registration order, then call the
        final <code>handler</code>.
      </p>

      <h4><code>withContainer(container: RoostContainer): this</code></h4>
      <p>
        Associate a container with the pipeline. Required for class-based middleware that needs
        dependency injection.
      </p>

      <h2>Application API</h2>
      <p>
        <code>Application</code> is the root orchestrator: it holds the container, config,
        service providers, and global middleware pipeline.
      </p>

      <h4><code>static create(env: Record&lt;string, unknown&gt;, config?: Record&lt;string, unknown&gt;): Application</code></h4>
      <p>Create a new Application instance with Cloudflare Worker environment bindings and optional configuration.</p>

      <h4><code>register(Provider: ServiceProviderClass): this</code></h4>
      <p>
        Register a service provider. Providers are instantiated and their <code>register()</code>
        method is called during <code>boot()</code>. Returns <code>this</code> for chaining.
      </p>

      <h4><code>useMiddleware(middleware: Middleware | MiddlewareClass, ...args: string[]): this</code></h4>
      <p>Add global middleware that runs on every request handled by this application.</p>

      <h4><code>onDispatch(handler: Handler): this</code></h4>
      <p>Set the request dispatcher called after all middleware. Replaces any previously set dispatcher.</p>

      <h4><code>async boot(): Promise&lt;void&gt;</code></h4>
      <p>
        Instantiate all registered service providers and call their <code>register()</code> then
        <code>boot()</code> methods in registration order. Called automatically on the first
        <code>handle()</code> invocation.
      </p>

      <h4><code>async handle(request: Request): Promise&lt;Response&gt;</code></h4>
      <p>
        Handle an incoming HTTP request. Creates a scoped container per request, runs global
        middleware, and calls the dispatcher.
      </p>

      <h2>ServiceProvider API</h2>
      <p>
        <code>ServiceProvider</code> is an abstract base class for bootstrapping application
        features. Extend it to register bindings and run initialization logic.
      </p>

      <h4><code>abstract register(): Promise&lt;void&gt; | void</code></h4>
      <p>
        Register bindings into the container. Called before any <code>boot()</code> methods run,
        so all providers have the opportunity to register before any boots.
      </p>

      <h4><code>boot(): Promise&lt;void&gt; | void</code></h4>
      <p>
        Optional. Runs after all providers have called <code>register()</code>. Safe to resolve
        dependencies registered by other providers here.
      </p>

      <h4><code>container: RoostContainer</code></h4>
      <p>The application container. Available in both <code>register()</code> and <code>boot()</code>.</p>

      <h2>Types</h2>
      <CodeBlock>{`type Token<T> = abstract new (...args: any[]) => T | symbol | string;
type Factory<T> = (container: RoostContainer) => T;
type Handler = (request: Request) => Promise<Response>;
type Middleware = (request: Request, next: Handler) => Promise<Response>;
type MiddlewareClass = new (...args: string[]) => { handle: Middleware };`}</CodeBlock>

      <h2>Errors</h2>

      <h4><code>BindingNotFoundError</code></h4>
      <p>Thrown by <code>resolve()</code> when no binding is registered for the token.</p>

      <h4><code>CircularDependencyError</code></h4>
      <p>Thrown when a circular dependency is detected during resolution.</p>

      <h4><code>ConfigKeyNotFoundError</code></h4>
      <p>Thrown by <code>ConfigManager.get()</code> when the key does not exist and no default is provided.</p>

    </DocLayout>
  );
}
