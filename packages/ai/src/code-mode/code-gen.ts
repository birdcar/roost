import type { StatefulAgent } from '../stateful/agent.js';

export interface CodeGenContext {
  intent: string;
  availableBindings: string[];
  availableTools?: Array<{ name: string; description: string }>;
}

export interface CodeGenerator {
  generate(ctx: CodeGenContext): Promise<string>;
}

export class PromptingCodeGenerator implements CodeGenerator {
  constructor(private readonly agent: StatefulAgent) {}

  async generate(ctx: CodeGenContext): Promise<string> {
    const tools = (ctx.availableTools ?? [])
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    const prompt =
      `You are an agent authoring JavaScript to accomplish the intent below.\n` +
      `Intent: ${ctx.intent}\n` +
      `Available bindings (already in scope as identifiers): ${ctx.availableBindings.join(', ')}\n` +
      (tools ? `Available tools:\n${tools}\n` : '') +
      `Return ONLY the function body. Do not reference process, env, require, eval, or import.`;
    const response = await this.agent.prompt(prompt);
    return extractCode(response.text);
  }
}

function extractCode(raw: string): string {
  const fenced = raw.match(/```(?:js|ts|javascript|typescript)?\n([\s\S]*?)```/);
  return (fenced?.[1] ?? raw).trim();
}
