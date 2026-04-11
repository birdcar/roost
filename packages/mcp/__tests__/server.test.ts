import { describe, test, expect } from 'bun:test';
import { McpServer } from '../src/server';
import { McpTool } from '../src/tool';
import { McpResource } from '../src/resource';
import { McpPrompt } from '../src/prompt';
import { McpResponse } from '../src/response';
import type { McpRequest } from '../src/types';
import { schema } from '@roost/schema';

class CalculatorTool extends McpTool {
  description() { return 'Add two numbers'; }
  schema(s: typeof schema) {
    return {
      a: s.integer().description('First number'),
      b: s.integer().description('Second number'),
    };
  }
  handle(request: McpRequest) {
    const a = request.get<number>('a');
    const b = request.get<number>('b');
    return McpResponse.text(String(a + b));
  }
}

class GuidelinesResource extends McpResource {
  description() { return 'Usage guidelines'; }
  uri() { return 'app://guidelines'; }
  handle() { return McpResponse.text('Follow these guidelines...'); }
}

class GreetPrompt extends McpPrompt {
  description() { return 'Generate a greeting'; }
  arguments() {
    return [{ name: 'name', description: 'Person to greet', required: true }];
  }
  handle(request: McpRequest) {
    return McpResponse.text(`Hello ${request.get<string>('name')}!`);
  }
}

class TestServer extends McpServer {
  tools = [CalculatorTool];
  resources = [GuidelinesResource];
  prompts = [GreetPrompt];
}

describe('McpServer', () => {
  test('listTools returns tool definitions', () => {
    const server = new TestServer();
    const tools = server.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].description).toBe('Add two numbers');
    expect(tools[0].inputSchema).toBeDefined();
  });

  test('listResources returns resource definitions', () => {
    const server = new TestServer();
    const resources = server.listResources();

    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('app://guidelines');
  });

  test('listPrompts returns prompt definitions', () => {
    const server = new TestServer();
    const prompts = server.listPrompts();

    expect(prompts).toHaveLength(1);
    expect(prompts[0].arguments).toHaveLength(1);
    expect(prompts[0].arguments[0].name).toBe('name');
  });

  test('callTool invokes tool and returns response', async () => {
    const server = new TestServer();
    const response = await server.callTool('calculator', { a: 5, b: 3 });
    const json = response.toJSON();

    expect(json.content[0].text).toBe('8');
  });

  test('callTool returns error for unknown tool', async () => {
    const server = new TestServer();
    const response = await server.callTool('unknown', {});
    const json = response.toJSON();

    expect(json.content[0].isError).toBe(true);
  });

  test('readResource returns content', async () => {
    const server = new TestServer();
    const response = await server.readResource('app://guidelines');
    const json = response.toJSON();

    expect(json.content[0].text).toContain('guidelines');
  });

  test('runPrompt returns messages', async () => {
    const server = new TestServer();
    const response = await server.runPrompt('greet', { name: 'Alice' });
    const json = (response as McpResponse).toJSON();

    expect(json.content[0].text).toBe('Hello Alice!');
  });

  test('static tool() tests a tool directly', async () => {
    const response = await McpServer.tool(CalculatorTool, { a: 10, b: 20 });
    expect(response.toJSON().content[0].text).toBe('30');
  });
});

describe('McpResponse', () => {
  test('text creates text response', () => {
    const r = McpResponse.text('hello');
    expect(r.toJSON().content[0]).toEqual({ type: 'text', text: 'hello' });
  });

  test('error creates error response', () => {
    const r = McpResponse.error('fail');
    const json = r.toJSON();
    expect(json.content[0].isError).toBe(true);
    expect(json.content[0].text).toBe('fail');
  });

  test('structured creates structured response', () => {
    const r = McpResponse.structured({ temp: 22.5 });
    expect(r.toJSON().content[0].structuredContent).toEqual({ temp: 22.5 });
  });

  test('withMeta adds metadata', () => {
    const r = McpResponse.text('hi').withMeta({ source: 'test' });
    expect(r.toJSON()._meta).toEqual({ source: 'test' });
  });
});
