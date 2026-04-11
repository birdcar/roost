import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: ChatPage,
});

function ChatPage() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Roost AI Chat</h1>
      <p>An AI chat app built with Roost.</p>
      <ul>
        <li>AI agent with tools (Calculator, CurrentTime)</li>
        <li>Streaming responses via SSE</li>
        <li>Conversation persistence in D1</li>
        <li>MCP server exposing chat history</li>
      </ul>
      <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
        <p style={{ color: '#666' }}>Chat UI would go here — agent responds via streaming SSE endpoint.</p>
      </div>
    </div>
  );
}
