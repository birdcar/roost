import { Agent } from '@roostjs/ai';
import type { Tool, ToolRequest } from '@roostjs/ai';
import { schema } from '@roostjs/schema';

class Calculator implements Tool {
  description() { return 'Adds two numbers together.'; }

  schema(s: typeof schema) {
    return {
      a: s.number().description('First number'),
      b: s.number().description('Second number'),
    };
  }

  async handle(request: ToolRequest): Promise<string> {
    const a = request.get<number>('a');
    const b = request.get<number>('b');
    return String(a + b);
  }
}

class CurrentTime implements Tool {
  description() { return 'Returns the current UTC time.'; }

  schema(_s: typeof schema) {
    return {};
  }

  async handle(): Promise<string> {
    return JSON.stringify({
      time: new Date().toISOString(),
      timezone: 'UTC',
    });
  }
}

export class ChatAssistant extends Agent {
  instructions() {
    return 'You are a helpful assistant. Use the calculator tool for math questions and the current time tool when asked about the time.';
  }

  tools() {
    return [new Calculator(), new CurrentTime()];
  }
}
