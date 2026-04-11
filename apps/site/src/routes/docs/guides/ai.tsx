import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/guides/ai')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/ai Guides" subtitle="Task-oriented instructions for agents, tools, streaming, and testing. Powered by Cloudflare Workers AI — no API keys required.">

      <h2>How to create an AI agent</h2>
      <p>Extend <code>Agent</code> and implement <code>instructions()</code> to define the system prompt. The AI binding in <code>wrangler.jsonc</code> is the only credential needed.</p>
      <CodeBlock title="wrangler.jsonc">{`{
  "ai": { "binding": "AI" }
}`}</CodeBlock>
      <CodeBlock title="src/agents/SupportAgent.ts">{`import { Agent } from '@roost/ai';

export class SupportAgent extends Agent {
  instructions(): string {
    return 'You are a helpful customer support agent for Acme Inc. Be concise and professional.';
  }
}

// Usage in a server function
const agent = new SupportAgent();
const response = await agent.prompt('How do I reset my password?');
console.log(response.text);`}</CodeBlock>
      <p>Each agent instance maintains its own conversation history. Create a new instance for each independent user session.</p>

      <h2>How to define and register tools</h2>
      <p>Implement the <code>Tool</code> interface and add the tool to your agent's <code>tools()</code> method.</p>
      <CodeBlock title="src/tools/OrderStatusTool.ts">{`import { type Tool, type ToolRequest } from '@roost/ai';
import { schema } from '@roost/schema';

export class OrderStatusTool implements Tool {
  constructor(private db: Database) {}

  description(): string {
    return 'Look up the status of a customer order by order ID';
  }

  schema(s: typeof schema) {
    return {
      orderId: s.string().description('The order ID to look up'),
    };
  }

  async handle(request: ToolRequest): Promise<string> {
    const orderId = request.get<string>('orderId');
    const order = await this.db.findOrder(orderId);
    if (!order) return 'Order not found.';
    return \`Order \${orderId}: status=\${order.status}, updated=\${order.updatedAt}\`;
  }
}`}</CodeBlock>
      <CodeBlock title="src/agents/SupportAgent.ts">{`import { Agent, type HasTools } from '@roost/ai';
import { OrderStatusTool } from '../tools/OrderStatusTool';

export class SupportAgent extends Agent implements HasTools {
  constructor(private db: Database) {
    super();
  }

  instructions(): string {
    return 'You are a helpful customer support agent.';
  }

  tools() {
    return [new OrderStatusTool(this.db)];
  }
}`}</CodeBlock>

      <h2>How to configure the model and parameters</h2>
      <p>Use class decorators to set defaults. All decorators can be overridden per-prompt via the options argument.</p>
      <CodeBlock title="src/agents/WritingAgent.ts">{`import { Agent, Model, MaxSteps, Temperature, MaxTokens } from '@roost/ai';

@Model('@cf/meta/llama-3.1-70b-instruct')
@Temperature(0.9)     // More creative responses
@MaxTokens(4096)      // Allow longer outputs
@MaxSteps(3)          // Max tool calls before final answer
export class WritingAgent extends Agent {
  instructions(): string {
    return 'You are a creative writing assistant.';
  }
}

// Override per-prompt
const response = await agent.prompt('Write a haiku', {
  temperature: 0.3,  // Override to more deterministic
  maxTokens: 100,
});`}</CodeBlock>
      <p>Available Cloudflare models include <code>@cf/meta/llama-3.1-8b-instruct</code>, <code>@cf/meta/llama-3.1-70b-instruct</code>, and <code>@cf/mistral/mistral-7b-instruct-v0.2</code>.</p>

      <h2>How to stream agent responses</h2>
      <p>Use <code>agent.stream()</code> to get an async iterable of text chunks. Useful for real-time UI updates.</p>
      <CodeBlock>{`const agent = new WritingAgent();
const stream = await agent.stream('Write a short story about a robot');

// Collect and forward as a streaming response
const encoder = new TextEncoder();
const body = new ReadableStream({
  async start(controller) {
    for await (const chunk of stream) {
      controller.enqueue(encoder.encode(chunk));
    }
    controller.close();
  },
});

return new Response(body, {
  headers: { 'content-type': 'text/plain; charset=utf-8' },
});`}</CodeBlock>
      <p>On the client, read the stream with the Fetch API's <code>response.body</code> reader or use a library like <code>ai</code> for React streaming hooks.</p>

      <h2>How to manage conversation memory</h2>
      <p>Agent instances maintain in-memory conversation history. For persistent cross-request memory, serialize and restore the history manually.</p>
      <CodeBlock>{`const agent = new SupportAgent(db);

// Conversation within a single request lifecycle
const r1 = await agent.prompt('My order #1234 is late.');
const r2 = await agent.prompt('Can you check the status?');
// Agent remembers the order number from the first turn`}</CodeBlock>
      <CodeBlock>{`// For persistent sessions, pass prior history as context in instructions
export class SupportAgent extends Agent {
  constructor(private history: string[]) {
    super();
  }

  instructions(): string {
    const context = this.history.length
      ? '\\n\\nPrevious context:\\n' + this.history.join('\\n')
      : '';
    return 'You are a helpful support agent.' + context;
  }
}`}</CodeBlock>

      <h2>How to test agents without calling the AI provider</h2>
      <p>Use <code>Agent.fake()</code> to inject predetermined responses. Always call <code>Agent.restore()</code> after each test.</p>
      <CodeBlock title="tests/agents/SupportAgent.test.ts">{`import { describe, it, expect } from 'bun:test';
import { SupportAgent } from '../../src/agents/SupportAgent';

describe('SupportAgent', () => {
  it('responds to password reset questions', async () => {
    SupportAgent.fake(['To reset your password, visit /account/reset.']);

    const agent = new SupportAgent(fakeDb);
    const response = await agent.prompt('How do I reset my password?');

    expect(response.text).toContain('reset');
    SupportAgent.restore();
  });

  it('was prompted with the user input', async () => {
    SupportAgent.fake(['Order found.']);

    const agent = new SupportAgent(fakeDb);
    await agent.prompt('Check order 5678');

    SupportAgent.assertPrompted('5678');
    SupportAgent.restore();
  });
});`}</CodeBlock>

    </DocLayout>
  );
}
