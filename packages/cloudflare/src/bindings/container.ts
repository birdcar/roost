export interface ContainerSendOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}

export class ContainerClient {
  constructor(private namespace: DurableObjectNamespace) {}

  get raw(): DurableObjectNamespace {
    return this.namespace;
  }

  getStub(name: string): DurableObjectStub {
    const id = this.namespace.idFromName(name);
    return this.namespace.get(id);
  }

  async send(name: string, path: string, options?: ContainerSendOptions): Promise<Response> {
    const stub = this.getStub(name);
    return stub.fetch(`http://container${path}`, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body,
    });
  }

  async warmup(name: string): Promise<boolean> {
    try {
      const response = await this.send(name, '/health');
      return response.ok;
    } catch {
      return false;
    }
  }
}
