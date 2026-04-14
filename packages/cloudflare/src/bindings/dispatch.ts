import { ServiceClient } from './service.js';

export type DispatchTrustMode = 'untrusted' | 'trusted';

export interface DispatchOptions {
  trust?: DispatchTrustMode;
  outboundArgs?: unknown[];
}

export class DispatchNamespaceClient {
  constructor(private namespace: DispatchNamespace) {}

  get raw(): DispatchNamespace {
    return this.namespace;
  }

  dispatch(scriptName: string, options?: DispatchOptions): Fetcher {
    return this.namespace.get(scriptName, {
      outbound: options?.outboundArgs ? { args: options.outboundArgs } : undefined,
    });
  }

  dispatchClient(scriptName: string, options?: DispatchOptions): ServiceClient {
    const fetcher = this.dispatch(scriptName, options);
    return new ServiceClient(fetcher);
  }
}
