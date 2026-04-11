import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/ai')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/ai" subtitle="Class-based AI agents with typed tools, conversation memory, and streaming. Powered exclusively by Cloudflare Workers AI — no API keys required.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/ai @roost/schema`}</CodeBlock>

      <h2>Configuration</h2>
      <p>
        The AI package uses <strong>Cloudflare Workers AI exclusively</strong>. There are no
        API keys and no external AI providers. The <code>AI</code> binding must be declared
        in <code>wrangler.jsonc</code>:
      </p>
      <CodeBlock title="wrangler.jsonc">{`{
  "ai": { "binding": "AI" }
}`}</CodeBlock>
      <p>Register the service provider to inject the provider into all agent classes:</p>
      <CodeBlock title="src/app.ts">{`import { AiServiceProvider } from '@roost/ai';
app.register(AiServiceProvider);`}</CodeBlock>
      <p>
        The default model is <code>@cf/meta/llama-3.1-8b-instruct</code>. Override per class
        using the <code>@Model</code> decorator.
      </p>

      <h2>Agent API</h2>
      <p>
        <code>Agent</code> is an abstract base class. Extend it and implement
        <code>instructions()</code>. One agent instance represents one conversation.
      </p>

      <h4><code>abstract instructions(): string</code></h4>
      <p>Returns the system prompt sent as the first message in every conversation turn.</p>

      <h4><code>async prompt(input: string, options?: Partial&lt;AgentConfig&gt;): Promise&lt;AgentResponse&gt;</code></h4>
      <p>
        Send a user message. Appends the message to the conversation history, calls the
        Cloudflare AI model, executes any tool calls returned by the model (up to
        <code>maxSteps</code>), and returns the final response. Conversation history is
        retained on the instance for subsequent calls.
      </p>
      <CodeBlock>{`const response = await agent.prompt('Hello');
console.log(response.text);       // Model text response
console.log(response.toolCalls);  // Tool calls made (if any)
console.log(response.messages);   // Full message history`}</CodeBlock>

      <h4><code>async stream(input: string): Promise&lt;ReadableStream&lt;Uint8Array&gt;&gt;</code></h4>
      <p>
        Send a user message and return a Server-Sent Events stream. Each chunk is a JSON
        object with a <code>type</code> field (<code>'text-delta'</code> or <code>'done'</code>).
      </p>

      <h4><code>static setProvider(provider: AIProvider): void</code></h4>
      <p>
        Set the AI provider for this agent class. Called automatically by
        <code>AiServiceProvider</code> during boot. Use in tests or custom setups.
      </p>

      <h4><code>static clearProvider(): void</code></h4>
      <p>Remove the provider set via <code>setProvider()</code>.</p>

      <h4><code>static fake(responses?: string[]): void</code></h4>
      <p>
        Enable fake mode. All <code>prompt()</code> calls return from the <code>responses</code>
        array in order (cycling the last response when exhausted) without calling the AI binding.
      </p>

      <h4><code>static restore(): void</code></h4>
      <p>Disable fake mode and restore normal provider behaviour.</p>

      <h4><code>static assertPrompted(textOrFn: string | ((prompt: string) =&gt; boolean)): void</code></h4>
      <p>
        Assert that at least one <code>prompt()</code> call matched. Accepts a substring
        or a predicate function. Throws if no match is found. Only valid after
        <code>fake()</code>.
      </p>

      <h4><code>static assertNeverPrompted(): void</code></h4>
      <p>Assert that no <code>prompt()</code> calls were made. Only valid after <code>fake()</code>.</p>

      <h2>HasTools Interface</h2>
      <p>
        Implement <code>HasTools</code> on an agent subclass to enable tool use. The agent
        will pass all registered tools to the model and execute their handlers when the
        model requests a tool call.
      </p>

      <h4><code>tools(): Tool[]</code></h4>
      <p>Return the list of tool instances available to this agent.</p>

      <h2>HasStructuredOutput Interface</h2>

      <h4><code>schema(s: typeof schema): Record&lt;string, SchemaBuilder&gt;</code></h4>
      <p>Define the expected JSON output shape using the schema builder.</p>

      <h2>Tool Interface</h2>
      <p>
        Implement the <code>Tool</code> interface to create a callable tool. Tools are
        passed to the model as function definitions and invoked by the agent runtime
        when the model emits a tool call.
      </p>

      <h4><code>description(): string</code></h4>
      <p>One-sentence description of what the tool does. Sent to the model to aid tool selection.</p>

      <h4><code>schema(s: typeof schema): Record&lt;string, SchemaBuilder&gt;</code></h4>
      <p>Define the tool's input parameters. Each key in the returned object is a parameter name mapped to a schema builder.</p>

      <h4><code>async handle(request: ToolRequest): Promise&lt;string&gt;</code></h4>
      <p>Execute the tool. Must return a string. The string is fed back to the model as the tool result.</p>

      <h2>ToolRequest API</h2>

      <h4><code>get&lt;T&gt;(key: string): T</code></h4>
      <p>Retrieve a typed parameter value from the tool call arguments.</p>

      <h2>CloudflareAIProvider</h2>
      <p>
        The only built-in <code>AIProvider</code> implementation. Wraps <code>AIClient</code>
        from <code>@roost/cloudflare</code>, which in turn wraps the Cloudflare Workers
        <code>Ai</code> binding. Registered automatically by <code>AiServiceProvider</code>.
      </p>

      <h4><code>constructor(client: AIClient)</code></h4>
      <p>Construct with an <code>AIClient</code> wrapping the <code>AI</code> binding.</p>

      <h4><code>async chat(request: ProviderRequest): Promise&lt;ProviderResponse&gt;</code></h4>
      <p>Send a chat request to Cloudflare Workers AI and return the response.</p>

      <h2>agent() Factory</h2>

      <h4><code>agent(options: &#123; instructions: string; tools?: Tool[]; provider?: AIProvider &#125;): &#123; prompt: (input: string) =&gt; Promise&lt;AgentResponse&gt; &#125;</code></h4>
      <p>
        Create an anonymous agent without defining a class. Returns an object with a single
        <code>prompt</code> method.
      </p>

      <h2>Decorators</h2>
      <p>Class decorators applied to <code>Agent</code> subclasses. All are optional.</p>

      <h4><code>@Model(model: string)</code></h4>
      <p>
        Set the Cloudflare Workers AI model identifier. Default is
        <code>@cf/meta/llama-3.1-8b-instruct</code>. The value must be a valid model
        available in your Cloudflare account.
      </p>

      <h4><code>@MaxSteps(maxSteps: number)</code></h4>
      <p>
        Maximum number of tool-call iterations per <code>prompt()</code> call. Defaults to
        <code>5</code>. The model stops looping once it emits a response with no tool calls
        or when this limit is reached.
      </p>

      <h4><code>@Temperature(temperature: number)</code></h4>
      <p>Sampling temperature passed to the model. Range: <code>0</code> (deterministic) to <code>1</code>.</p>

      <h4><code>@MaxTokens(maxTokens: number)</code></h4>
      <p>Maximum number of tokens in the model response.</p>

      <h4><code>@Provider(provider: string)</code></h4>
      <p>Named provider identifier. Stored in the agent config for custom provider lookup logic.</p>

      <h4><code>@Timeout(timeout: number)</code></h4>
      <p>Timeout in milliseconds for a single model call.</p>

      <h2>Types</h2>
      <CodeBlock>{`interface AgentConfig {
  provider?: string;
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

interface AgentResponse {
  text: string;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ProviderRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ProviderTool[];
  maxTokens?: number;
  temperature?: number;
}

interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}`}</CodeBlock>

    </DocLayout>
  );
}
