// Callers using poll() must configure their fetcher with
// Authorization: Bearer <CF_API_TOKEN> to authenticate against the Workers AI REST API.

interface AiRunOptions {
  headers?: Record<string, string>;
  queueRequest?: boolean;
}

export class AIClient {
  constructor(private ai: Ai) {}

  async run<T = string>(
    model: string,
    inputs: Record<string, unknown>,
    options?: AiOptions & AiRunOptions,
  ): Promise<T | { id: string }> {
    const { headers: _headers, queueRequest, ...aiOptions } = options ?? {};

    if (queueRequest) {
      return this.ai.run(model as any, inputs as any, { ...aiOptions, queueRequest: true }) as unknown as Promise<{ id: string }>;
    }

    return this.ai.run(model as any, inputs as any, aiOptions as AiOptions) as Promise<T>;
  }

  // poll() checks the status of an async Workers AI task via the REST API.
  // Pass `fetch` (available in Workers scope) as the fetcher — it must carry
  // Authorization: Bearer <CF_API_TOKEN> to authenticate.
  // accountId is the Cloudflare account that owns the task.
  async poll<T = string>(
    taskId: string,
    fetcher: typeof fetch,
    accountId: string,
  ): Promise<{ status: 'running' } | { status: 'done'; result: T }> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/tasks/${taskId}`;
    const response = await fetcher(url);
    const data = (await response.json()) as {
      result: { status: string; output?: T };
      success: boolean;
    };

    if (data.result.status === 'done') {
      return { status: 'done', result: data.result.output as T };
    }

    return { status: 'running' };
  }
}
