import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/ai')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/ai" subtitle="Why agents are classes, how the agentic loop works, and why Cloudflare Workers AI means no external API keys or network calls.">
      <h2>Why Class-Based Agents</h2>
      <p>
        Agents could be plain functions: <code>const agent = createAgent({'{'} instructions, tools {'}'});</code>.
        This is the approach taken by several popular AI SDK libraries. Roost instead makes agents
        classes for reasons that become apparent once an application has more than one or two agents.
      </p>
      <p>
        Class-based agents have inherent identity. When you have a <code>ResearchAssistant</code>,
        a <code>SupportAgent</code>, and a <code>BillingConcierge</code>, their names appear in
        logs, error messages, and test assertions. Decorators — <code>@Model</code>, <code>@MaxSteps</code>,
        <code>@Temperature</code> — can be attached to the class rather than buried in an options
        object, making configuration visually prominent. The static <code>fake()</code> and
        <code>restore()</code> methods work on the class as a whole, so tests can fake a specific
        agent type without affecting other agents in the same test suite.
      </p>
      <p>
        Conversation memory is also cleaner on instances: create a new agent instance for each
        independent conversation, and the instance holds that conversation's history. When the
        conversation ends, discard the instance. No external state management is required for
        the common case.
      </p>

      <h2>The Agentic Loop</h2>
      <p>
        When <code>agent.prompt(input)</code> is called, it does not simply send a message and
        return a response. It enters a loop. The agent sends the current message history to the
        model. If the model responds with tool calls, the agent executes those tools and adds
        the results to the message history, then sends the updated history back to the model.
        This continues until the model responds with text (not tool calls) or until
        <code>maxSteps</code> is reached.
      </p>
      <p>
        This loop is what makes agents genuinely agentic rather than just "LLM with context."
        A research agent that needs to search the web, summarize three pages, and synthesize
        an answer makes multiple sequential tool calls in a single <code>prompt()</code> invocation.
        The caller receives the final synthesized answer without needing to orchestrate the
        intermediate steps.
      </p>

      <h2>Cloudflare Workers AI: No API Keys, No External Calls</h2>
      <p>
        When your Roost agent runs on Cloudflare Workers, inference does not go through an
        external API. It runs on Cloudflare's own GPU infrastructure via the Workers AI binding.
        There are no API keys to manage, no OpenAI or Anthropic billing to configure, and no
        external network requests that could fail, time out, or be rate-limited by a third-party
        service.
      </p>
      <p>
        The <code>CloudflareAIProvider</code> calls <code>AIClient.run(model, inputs)</code>, which
        resolves through the <code>env.AI</code> binding — a Cloudflare binding, not an HTTP
        endpoint. The inference happens inside Cloudflare's network, at a data center geographically
        close to the executing Worker. This is not a small operational advantage: it means AI
        inference inherits Workers' reliability and latency characteristics rather than adding
        a new external dependency.
      </p>

      <h2>The AIProvider Interface</h2>
      <p>
        The <code>AIProvider</code> interface exists to make the AI backend swappable. The default
        and built-in provider is <code>CloudflareAIProvider</code>. An application can register
        a different provider on an agent class via <code>AgentClass.setProvider(provider)</code>.
        This extensibility is intended primarily for testing and for teams that want to run a
        specific agent through a different backend — not as an invitation to routinely switch
        providers per request.
      </p>

      <h2>Default Model Rationale</h2>
      <p>
        The default model is <code>@cf/meta/llama-3.1-8b-instruct</code>. The 8B Llama model
        is fast and cheap to run, suitable for most tool-assisted tasks. Agents that need more
        capability can override with <code>@cf/meta/llama-3.1-70b-instruct</code> via the
        <code>@Model</code> decorator. The default is the smallest model that is generally
        useful, not the largest model that might be impressive — smaller models fail faster
        and cost less, which is the right default before profiling.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/cloudflare">@roost/cloudflare concepts — AIClient and the Workers AI binding</a></li>
        <li><a href="/docs/concepts/mcp">@roost/mcp concepts — how MCP tools relate to AI agent tools</a></li>
        <li><a href="/docs/concepts/schema">@roost/schema concepts — how tool schemas are defined</a></li>
        <li><a href="/docs/packages/ai">@roost/ai reference — Agent, Tool, and decorator API</a></li>
      </ul>
    </DocLayout>
  );
}
