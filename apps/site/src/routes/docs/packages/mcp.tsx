import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/mcp')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/mcp</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>MCP (Model Context Protocol) server implementation. Expose your app's capabilities as tools, resources, and prompts to AI clients like Claude and Cursor.</p>

      <h2>Defining an MCP Server</h2>
      <pre><code>{`import { McpServer, McpTool, McpResource, McpResponse } from '@roost/mcp';

class MyServer extends McpServer {
  tools = [SearchTool];
  resources = [DocsResource];
  prompts = [SummarizePrompt];
}`}</code></pre>

      <h2>MCP Tools</h2>
      <pre><code>{`class SearchTool extends McpTool {
  description() { return 'Search the knowledge base.'; }
  schema(s) {
    return { query: s.string().description('Search query') };
  }
  async handle(request) {
    const query = request.get<string>('query');
    return McpResponse.text(\`Results for: \${query}\`);
  }
}`}</code></pre>

      <h2>Testing</h2>
      <pre><code>{`// Test tools directly without HTTP
const response = await McpServer.tool(SearchTool, { query: 'roost' });
expect(response.toJSON().content[0].text).toContain('roost');`}</code></pre>
    </div>
  );
}
