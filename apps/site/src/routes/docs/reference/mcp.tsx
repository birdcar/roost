import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/mcp')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/mcp" subtitle="Model Context Protocol server implementation. Expose application capabilities as tools, resources, and prompts to MCP-compatible AI clients.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/mcp @roost/schema`}</CodeBlock>

      <h2>McpServer API</h2>
      <p>
        <code>McpServer</code> is an abstract base class. Extend it and declare the tool,
        resource, and prompt classes to expose.
      </p>

      <h4><code>abstract tools: Array&lt;new () =&gt; McpTool&gt;</code></h4>
      <p>Array of tool class constructors to register with the server.</p>

      <h4><code>abstract resources: Array&lt;new () =&gt; McpResource&gt;</code></h4>
      <p>Array of resource class constructors to register.</p>

      <h4><code>abstract prompts: Array&lt;new () =&gt; McpPrompt&gt;</code></h4>
      <p>Array of prompt class constructors to register.</p>

      <h4><code>abstract serverName(): string</code></h4>
      <p>The server name reported in the MCP handshake.</p>

      <h4><code>abstract serverVersion(): string</code></h4>
      <p>The server version reported in the MCP handshake.</p>

      <h4><code>serverInstructions(): string</code></h4>
      <p>Optional. Instructions string included in the MCP server info response.</p>

      <h4><code>listTools(): ToolDefinition[]</code></h4>
      <p>Returns all registered tool definitions in MCP protocol format.</p>

      <h4><code>listResources(): ResourceDefinition[]</code></h4>
      <p>Returns all registered resource definitions.</p>

      <h4><code>listPrompts(): PromptDefinition[]</code></h4>
      <p>Returns all registered prompt definitions.</p>

      <h4><code>async callTool(name: string, args: Record&lt;string, unknown&gt;): Promise&lt;McpResponse&gt;</code></h4>
      <p>Find the tool with the given name and invoke its <code>handle()</code> method.</p>

      <h4><code>async readResource(uri: string): Promise&lt;McpResponse&gt;</code></h4>
      <p>Find the resource matching the URI and invoke its <code>handle()</code> method.</p>

      <h4><code>async runPrompt(name: string, args: Record&lt;string, unknown&gt;): Promise&lt;McpResponse | McpResponse[]&gt;</code></h4>
      <p>Find the prompt with the given name and invoke its <code>handle()</code> method.</p>

      <h4><code>static async tool(ToolClass: new () =&gt; McpTool, args: Record&lt;string, unknown&gt;): Promise&lt;McpResponse&gt;</code></h4>
      <p>Directly invoke a tool class without going through the server routing. Used in tests.</p>

      <h2>McpTool API</h2>
      <p>Abstract base class for MCP tools.</p>

      <h4><code>abstract description(): string</code></h4>
      <p>One-sentence description of the tool. Sent to the client in the tools list.</p>

      <h4><code>abstract schema(s: typeof schema): Record&lt;string, SchemaBuilder&gt;</code></h4>
      <p>Define input parameters using the schema builder from <code>@roost/schema</code>.</p>

      <h4><code>abstract async handle(request: McpRequest): Promise&lt;McpResponse&gt;</code></h4>
      <p>Execute the tool logic and return an <code>McpResponse</code>.</p>

      <h4><code>shouldRegister?(): boolean</code></h4>
      <p>Optional. Return <code>false</code> to conditionally exclude the tool from registration.</p>

      <h2>McpResource API</h2>
      <p>Abstract base class for MCP resources.</p>

      <h4><code>abstract uri(): string</code></h4>
      <p>The resource URI. Must be unique within the server.</p>

      <h4><code>abstract description(): string</code></h4>
      <p>Human-readable description of the resource content.</p>

      <h4><code>abstract mimeType(): string</code></h4>
      <p>MIME type of the resource content (e.g., <code>'text/plain'</code>, <code>'text/markdown'</code>, <code>'application/json'</code>).</p>

      <h4><code>abstract async handle(request: McpRequest): Promise&lt;McpResponse&gt;</code></h4>
      <p>Return the resource content wrapped in an <code>McpResponse</code>.</p>

      <h2>McpPrompt API</h2>
      <p>Abstract base class for MCP prompts.</p>

      <h4><code>abstract description(): string</code></h4>
      <p>Description of what the prompt does.</p>

      <h4><code>abstract schema(s: typeof schema): Record&lt;string, SchemaBuilder&gt;</code></h4>
      <p>Define the prompt's input parameters.</p>

      <h4><code>abstract async handle(request: McpRequest): Promise&lt;McpResponse | McpResponse[]&gt;</code></h4>
      <p>Return the constructed prompt text. May return multiple message objects.</p>

      <h2>McpRequest API</h2>

      <h4><code>get&lt;T&gt;(key: string): T</code></h4>
      <p>Retrieve a typed parameter value from the invocation arguments.</p>

      <h2>McpResponse API</h2>

      <h4><code>static text(content: string): McpResponse</code></h4>
      <p>Create a text content response.</p>

      <h4><code>static error(message: string): McpResponse</code></h4>
      <p>Create an error response.</p>

      <h4><code>toJSON(): &#123; content: Array&lt;&#123; type: string; text: string &#125;&gt; &#125;</code></h4>
      <p>Serialize the response to MCP protocol JSON format.</p>

      <h2>Types</h2>
      <CodeBlock>{`interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchemaOutput;
}

interface ResourceDefinition {
  uri: string;
  description: string;
  mimeType: string;
}

interface PromptDefinition {
  name: string;
  description: string;
  arguments: JsonSchemaOutput;
}`}</CodeBlock>

    </DocLayout>
  );
}
