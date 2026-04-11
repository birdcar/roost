import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/docs/packages/ai')({ component: Page });

function Page() {
  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '800px' }}>
      <h1>@roost/ai</h1>
      <p style={{ color: '#374151', lineHeight: 1.7 }}>Class-based AI agents modeled after Laravel 13's AI SDK. Typed tools, structured output, streaming, conversation memory.</p>

      <h2>Defining an Agent</h2>
      <pre><code>{`import { Agent } from '@roost/ai';

class Assistant extends Agent {
  instructions() {
    return 'You are a helpful assistant.';
  }

  tools() {
    return [new Calculator(), new WebSearch()];
  }
}

const agent = new Assistant();
const response = await agent.prompt('What is 6 * 7?');
console.log(response.text); // "42"`}</code></pre>

      <h2>Defining Tools</h2>
      <pre><code>{`import type { Tool, ToolRequest } from '@roost/ai';
import { schema } from '@roost/schema';

class Calculator implements Tool {
  description() { return 'Adds two numbers.'; }
  schema(s: typeof schema) {
    return {
      a: s.number().description('First number'),
      b: s.number().description('Second number'),
    };
  }
  async handle(request: ToolRequest) {
    return String(request.get<number>('a') + request.get<number>('b'));
  }
}`}</code></pre>

      <h2>Testing with Fakes</h2>
      <pre><code>{`Assistant.fake(['The answer is 42.']);
const response = await agent.prompt('What is 6 * 7?');
Assistant.assertPrompted('6 * 7');
Assistant.restore();`}</code></pre>
    </div>
  );
}
