import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/mcp')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/mcp" subtitle="What the Model Context Protocol is, why Roost supports it as a server, and how MCP tools differ from AI agent tools.">
      <h2>What MCP Is</h2>
      <p>
        The Model Context Protocol (MCP) is an open standard for connecting AI models to external
        tools and data sources. Instead of every AI application implementing its own bespoke tool
        integration, MCP defines a standard wire format that any AI client can use to discover and
        call tools on any MCP server. It is, in effect, a standardized API contract for AI tool use.
      </p>
      <p>
        An MCP server exposes three kinds of things: <strong>tools</strong> (functions the AI can call),
        <strong>resources</strong> (data sources the AI can read), and <strong>prompts</strong>
        (pre-defined prompt templates). An AI client — Claude Desktop, a custom chat interface,
        or another AI application — connects to the server, discovers what is available, and
        uses it. The server does not need to know anything about the specific AI model or client;
        the client does not need to know anything about the server's implementation language or
        framework.
      </p>

      <h2>Server-Side Tool Exposure</h2>
      <p>
        Roost's <code>McpServer</code> makes a Cloudflare Worker into an MCP server. A class
        extending <code>McpServer</code> declares its tools, resources, and prompts as arrays of
        class constructors. The server instantiates them on demand and handles the MCP protocol
        mechanics: listing capabilities, routing tool calls to the right tool, reading resources,
        running prompts. The application code only implements the <em>what</em> — what this tool
        does, what this resource contains — and the server handles the <em>how</em> of speaking MCP.
      </p>
      <p>
        Because MCP servers run as HTTP endpoints, a Cloudflare Worker is an ideal host. The server
        receives HTTP requests containing MCP messages and returns HTTP responses with MCP results.
        The edge deployment means the MCP server is globally distributed alongside the application
        it belongs to.
      </p>

      <h2>How MCP Tools Relate to AI Agent Tools</h2>
      <p>
        At first glance, <code>@roost/mcp</code> tools and <code>@roost/ai</code> tools look
        similar: both define a description, a parameter schema, and a handle method. The distinction
        is the audience. AI agent tools are consumed by Roost agents running inside your application —
        they are called by the agentic loop inside <code>agent.prompt()</code>. MCP tools are
        consumed by external AI clients connecting to your application over HTTP.
      </p>
      <p>
        Both use <code>@roost/schema</code> for parameter definitions, which is the intentional
        overlap. A tool that makes sense as an AI agent tool will often also make sense as an
        MCP tool. The schema package provides the shared vocabulary, but the two packages serve
        different integration points: one is internal to your application, the other is an
        outward-facing API contract for AI clients you do not control.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/concepts/ai">@roost/ai concepts — agent tools and the agentic loop</a></li>
        <li><a href="/docs/concepts/schema">@roost/schema concepts — shared schema between AI and MCP tools</a></li>
        <li><a href="/docs/packages/mcp">@roost/mcp reference — McpServer, McpTool, McpResource, and McpPrompt API</a></li>
        <li><a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">Model Context Protocol Specification</a></li>
      </ul>
    </DocLayout>
  );
}
