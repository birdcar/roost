export class AIClient {
  constructor(private ai: Ai) {}

  async run<T = string>(model: string, inputs: Record<string, unknown>, options?: AiOptions): Promise<T> {
    return this.ai.run(model as any, inputs as any, options) as T;
  }
}
