import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';
import { Callout } from '../../../components/callout';

export const Route = createFileRoute('/docs/tutorials/build-a-chat-app')({
  component: BuildAChatAppPage,
});

function BuildAChatAppPage() {
  return (
    <DocLayout
      title="Build an AI Chat App"
      subtitle="Create a chat interface powered by Cloudflare Workers AI with conversation history."
    >
      <Callout type="note">
        <p><strong>What you'll learn</strong></p>
        <ul>
          <li>Create AI agents using <code>@roost/ai</code></li>
          <li>Define tools that agents can call during a conversation</li>
          <li>Store and retrieve data using the ORM (<code>@roost/orm</code>)</li>
        </ul>
        <p><strong>Time:</strong> ~30 minutes</p>
        <p>
          <strong>Prerequisites:</strong> Complete the{' '}
          <a href="/docs/getting-started">Quick Start guide</a> before following this tutorial.
        </p>
        <p>
          <strong>Packages used:</strong>{' '}
          <code>@roost/ai</code>, <code>@roost/orm</code>, <code>@roost/start</code>, <code>@roost/schema</code>
        </p>
      </Callout>

      <h2>Step 1: Create the Project — Scaffold with AI Support</h2>
      <p>
        The <code>--with-ai</code> flag tells the Roost CLI to scaffold your project with the{' '}
        <code>@roost/ai</code> package pre-installed and the Cloudflare Workers AI binding already
        configured in <code>wrangler.jsonc</code>.
      </p>
      <CodeBlock title="terminal">
        {`roost new chat-app --with-ai
cd chat-app
bun install`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> a new <code>chat-app/</code> directory. Inside{' '}
        <code>wrangler.jsonc</code> there will be an <code>ai</code> binding that looks like:
      </p>
      <CodeBlock title="wrangler.jsonc (excerpt)">
        {`{
  "ai": {
    "binding": "AI"
  }
}`}
      </CodeBlock>
      <p>
        No API keys are needed. Cloudflare Workers AI is available to any Workers account — the{' '}
        <code>AI</code> binding is all the configuration required.
      </p>

      <h2>Step 2: Create a ChatMessage Model — Persist Conversation History</h2>
      <p>
        Run the model generator to create a <code>ChatMessage</code> model and its migration file:
      </p>
      <CodeBlock title="terminal">
        {`roost make:model ChatMessage`}
      </CodeBlock>
      <p>
        This creates two files: <code>src/models/ChatMessage.ts</code> and a timestamped migration
        in <code>database/migrations/</code>. Open the migration and add the columns your chat app
        needs:
      </p>
      <CodeBlock title="database/migrations/XXXX_create_chat_messages_table.ts">
        {`import { Migration } from '@roost/orm';

export default class CreateChatMessagesTable extends Migration {
  async up() {
    await this.schema.createTable('chat_messages', (table) => {
      table.id();
      table.string('role');       // 'user' or 'assistant'
      table.text('content');      // the message body
      table.timestamps();         // created_at, updated_at
    });
  }

  async down() {
    await this.schema.dropTable('chat_messages');
  }
}`}
      </CodeBlock>
      <p>Now run the migration to create the table in your local D1 database:</p>
      <CodeBlock title="terminal">
        {`roost migrate`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> output confirming the migration ran successfully, e.g.{' '}
        <code>Migrated: XXXX_create_chat_messages_table</code>. The{' '}
        <code>chat_messages</code> table now exists in your D1 database.
      </p>

      <h2>Step 3: Create a ChatAssistant Agent — Define the AI's Behaviour</h2>
      <p>
        Run the agent generator, then open the generated file and give the agent its instructions:
      </p>
      <CodeBlock title="terminal">
        {`roost make:agent ChatAssistant`}
      </CodeBlock>
      <CodeBlock title="src/agents/ChatAssistant.ts">
        {`import { Agent, Model } from '@roost/ai';
import type { HasTools } from '@roost/ai';
import type { Tool } from '@roost/ai';
import { SummarizeTool } from './tools/SummarizeTool';

@Model('@cf/meta/llama-3.1-70b-instruct')
export class ChatAssistant extends Agent implements HasTools {
  instructions(): string {
    return [
      'You are a helpful assistant in a chat application.',
      'You have access to the conversation history via the SummarizeTool.',
      'Keep your responses concise and friendly.',
    ].join(' ');
  }

  tools(): Tool[] {
    return [new SummarizeTool()];
  }
}`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          The <code>@Model</code> decorator overrides the default model for this agent. The default
          is <code>@cf/meta/llama-3.1-8b-instruct</code>; here we use the larger 70B variant for
          better conversational quality. Both run on Cloudflare Workers AI at no extra configuration
          cost.
        </p>
      </Callout>
      <p>
        <strong>You should see</strong> no TypeScript errors when you run <code>bun run typecheck</code>.
        The agent is not wired to a route yet, so there is nothing to observe in the browser at
        this point.
      </p>

      <h2>Step 4: Create a SummarizeTool — Let the Agent Query History</h2>
      <p>
        Tools give an agent structured ways to retrieve data. This tool fetches the last ten
        messages from the database and returns them as a formatted string for the model to reason
        about.
      </p>
      <CodeBlock title="terminal">
        {`roost make:tool SummarizeTool`}
      </CodeBlock>
      <CodeBlock title="src/agents/tools/SummarizeTool.ts">
        {`import { type Tool, type ToolRequest } from '@roost/ai';
import { schema } from '@roost/schema';
import { ChatMessage } from '../../models/ChatMessage';

export class SummarizeTool implements Tool {
  description(): string {
    return 'Fetch the last N messages from conversation history.';
  }

  schema(s: typeof schema) {
    return {
      limit: s.number().describe('How many recent messages to fetch (max 20)'),
    };
  }

  async handle(request: ToolRequest): Promise<string> {
    const limit = Math.min(request.get<number>('limit'), 20);

    const messages = await ChatMessage.query()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    if (messages.length === 0) {
      return 'No conversation history yet.';
    }

    return messages
      .reverse()
      .map((m) => \`\${m.role}: \${m.content}\`)
      .join('\\n');
  }
}`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> no TypeScript errors. The tool implements the <code>Tool</code>{' '}
        interface, which requires <code>description()</code>, <code>schema()</code>, and{' '}
        <code>handle()</code>.
      </p>

      <h2>Step 5: Create the Chat Route — Build the UI</h2>
      <p>
        Create the page that displays the chat history and a text input for sending new messages:
      </p>
      <CodeBlock title="src/routes/chat.tsx">
        {`import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { sendMessage } from '../server/chat';

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const reply = await sendMessage({ data: { content: input } });
    setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem' }}>
      <h1>Chat</h1>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', minHeight: '400px', padding: '1rem', marginBottom: '1rem' }}>
        {messages.length === 0 && (
          <p style={{ color: '#9ca3af' }}>No messages yet. Say hello!</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '0.75rem', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span
              style={{
                display: 'inline-block',
                background: m.role === 'user' ? '#6366f1' : '#f3f4f6',
                color: m.role === 'user' ? '#fff' : '#111827',
                borderRadius: '8px',
                padding: '0.5rem 0.875rem',
                maxWidth: '80%',
              }}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && <p style={{ color: '#9ca3af' }}>Thinking…</p>}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> a blank chat page at{' '}
        <code>http://localhost:3000/chat</code> with an input box and a Send button. Submitting a
        message will fail until the next step wires in the server function.
      </p>

      <h2>Step 6: Wire the Agent to the Form — Save Messages and Get a Reply</h2>
      <p>
        Server functions in Roost run on the Cloudflare Worker, giving them access to D1, the AI
        binding, and all other bindings. Create a server function that saves the user's message,
        calls the agent, and saves the assistant's reply:
      </p>
      <CodeBlock title="src/server/chat.ts">
        {`import { createServerFn } from '@roost/start';
import { ChatAssistant } from '../agents/ChatAssistant';
import { ChatMessage } from '../models/ChatMessage';

export const sendMessage = createServerFn({
  method: 'POST',
}).handler(async ({ data }: { data: { content: string } }) => {
  // Persist the user's message to the database
  await ChatMessage.create({
    role: 'user',
    content: data.content,
  });

  // Ask the agent for a reply
  const assistant = new ChatAssistant();
  const response = await assistant.prompt(data.content);

  // Persist the assistant's reply to the database
  await ChatMessage.create({
    role: 'assistant',
    content: response.text,
  });

  return response.text;
});`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> messages appearing in the chat UI after you submit them.
        The assistant reply will arrive after a brief pause while the Worker calls Cloudflare
        Workers AI.
      </p>

      <h2>Step 7: Test It — Send Messages and Verify History</h2>
      <p>
        Start the development server if it is not already running, then open the chat page and
        send a few messages:
      </p>
      <CodeBlock title="terminal">
        {`bun run dev`}
      </CodeBlock>
      <ol>
        <li>Open <code>http://localhost:3000/chat</code>.</li>
        <li>Type "Hello, who are you?" and press Send.</li>
        <li>Wait for the assistant to reply.</li>
        <li>Type "What did I just ask you?" and press Send.</li>
      </ol>
      <p>
        <strong>You should see</strong> the assistant answer both questions. On the second message
        it may invoke <code>SummarizeTool</code> to retrieve the previous exchange from the
        database. You can confirm rows are being saved by querying D1 directly:
      </p>
      <CodeBlock title="terminal">
        {`bunx wrangler d1 execute chat-app --local --command "SELECT * FROM chat_messages"`}
      </CodeBlock>
      <p>
        <strong>You should see</strong> the messages you sent listed in the output, each with a
        <code>role</code> of either <code>user</code> or <code>assistant</code>.
      </p>

      <h2>Step 8: Add Streaming — Display Tokens in Real Time</h2>
      <p>
        Instead of waiting for the entire reply before displaying it, you can stream tokens as
        they arrive using <code>agent.stream()</code>. Update the server function to return a
        streaming response, then update the page to consume the event stream:
      </p>
      <CodeBlock title="src/server/chatStream.ts">
        {`import { createServerFn } from '@roost/start';
import { ChatAssistant } from '../agents/ChatAssistant';
import { ChatMessage } from '../models/ChatMessage';

export const streamMessage = createServerFn({
  method: 'POST',
}).handler(async ({ data }: { data: { content: string } }): Promise<ReadableStream<Uint8Array>> => {
  await ChatMessage.create({ role: 'user', content: data.content });

  const assistant = new ChatAssistant();
  const stream = await assistant.stream(data.content);

  // Fire-and-forget: save the assistant reply after streaming completes
  const [streamForClient, streamForSave] = stream.tee();

  (async () => {
    const reader = streamForSave.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text-delta') fullText += event.text ?? '';
        } catch { /* ignore parse errors on partial lines */ }
      }
    }

    await ChatMessage.create({ role: 'assistant', content: fullText });
  })();

  return streamForClient;
});`}
      </CodeBlock>
      <p>Update the chat page to consume the SSE stream and append tokens as they arrive:</p>
      <CodeBlock title="src/routes/chat.tsx (updated handleSubmit)">
        {`async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!input.trim() || loading) return;

  const userMessage: Message = { role: 'user', content: input };
  setMessages((prev) => [...prev, userMessage]);
  setInput('');
  setLoading(true);

  // Add an empty assistant message that we'll fill in as tokens arrive
  setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

  const stream = await streamMessage({ data: { content: input } });
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text-delta') {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: updated[updated.length - 1].content + (event.text ?? ''),
            };
            return updated;
          });
        }
      } catch { /* ignore parse errors on partial lines */ }
    }
  }

  setLoading(false);
}`}
      </CodeBlock>
      <Callout type="tip">
        <p>
          <code>agent.stream()</code> currently buffers the full response and emits it as a single{' '}
          <code>text-delta</code> event. True token-by-token streaming depends on provider support
          and will be transparent to your code when it becomes available — the event format stays
          the same.
        </p>
      </Callout>
      <p>
        <strong>You should see</strong> the assistant's reply appear incrementally rather than all
        at once. The typing indicator disappears only after the stream closes.
      </p>

      <h2>What You Built</h2>
      <p>You now have a fully working AI chat application on Cloudflare Workers that:</p>
      <ul>
        <li>Accepts user messages via a React form</li>
        <li>Persists every message to a D1 database using <code>@roost/orm</code></li>
        <li>
          Runs an AI agent backed by <code>@cf/meta/llama-3.1-70b-instruct</code> on Cloudflare
          Workers AI — no API keys required
        </li>
        <li>
          Exposes conversation history to the agent through a typed <code>SummarizeTool</code>
        </li>
        <li>Streams tokens to the browser in real time</li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li>
          <a href="/docs/reference/ai">@roost/ai reference</a> — full API documentation for{' '}
          <code>Agent</code>, <code>Tool</code>, decorators, and the provider interface
        </li>
        <li>
          <a href="/docs/guides/ai">AI guides</a> — practical patterns: structured output,
          multi-agent pipelines, testing agents with fakes
        </li>
        <li>
          <a href="/docs/concepts/ai">AI concepts</a> — how the agent loop, tool resolution, and
          Cloudflare Workers AI provider work under the hood
        </li>
      </ul>
    </DocLayout>
  );
}
