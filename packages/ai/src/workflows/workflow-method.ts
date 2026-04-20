import { Workflow as RoostWorkflow } from '@roostjs/workflow';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { AgentWorkflowClient, WorkflowStartHandle } from './workflow-client.js';

/**
 * Payload shape sent to the generated `AgentMethodWorkflow` when the decorated
 * method dispatches via the workflow client.
 */
export interface WorkflowMethodPayload {
  method: string;
  args: unknown[];
}

export interface WorkflowEntrypointRegistration {
  agentClass: Function;
  methodName: string;
  bindingName: string;
  originalMethod: (...args: unknown[]) => unknown;
  workflowClass: new (ctx: unknown, env: unknown) => RoostWorkflow<unknown, WorkflowMethodPayload>;
}

const registrations = new Map<string, WorkflowEntrypointRegistration>();

/**
 * Expose the registry so tooling (wrangler.toml generator, test harnesses) can
 * walk every `@Workflow`-decorated method.
 */
export function getWorkflowRegistrations(): ReadonlyMap<string, WorkflowEntrypointRegistration> {
  return registrations;
}

/** @internal — exposed for tests that need to reset the registry. */
export function _clearWorkflowRegistrations(): void {
  registrations.clear();
}

export class WorkflowClientNotRegisteredError extends Error {
  override readonly name = 'WorkflowClientNotRegisteredError';
  constructor(bindingName: string) {
    super(
      `No WorkflowClient registered for binding '${bindingName}'. Register it in your wrangler.toml and AiServiceProvider, or provide the client via this.workflows.`,
    );
  }
}

interface WorkflowHost {
  workflows?: Map<string, AgentWorkflowClient<WorkflowMethodPayload>>;
}

/**
 * Method decorator: turn an agent method into a durable workflow. The runtime
 * generates a companion `AgentMethodWorkflow` entrypoint class and rewrites
 * the method to dispatch via the workflow client. The original method is
 * invoked inside the entrypoint with `step` injected as the first positional
 * argument.
 *
 * Consumers declare a Workflow binding in wrangler.toml and export the
 * generated entrypoint class (accessible via `getWorkflowRegistrations()`).
 *
 * @example
 *   class ReportAgent extends StatefulAgent {
 *     instructions() { return 'reports'; }
 *     @Workflow({ binding: 'REPORT_WORKFLOW' })
 *     async process(step: WorkflowStep, reportId: string) {
 *       const data = await step.do('fetch', () => this.fetch(reportId));
 *       return data;
 *     }
 *   }
 */
export function Workflow(opts?: { binding?: string; name?: string }) {
  return function (target: object, key: string | symbol, descriptor: PropertyDescriptor) {
    const methodName = String(key);
    const original = descriptor.value as (...args: unknown[]) => unknown;
    if (typeof original !== 'function') {
      throw new TypeError(`@Workflow can only decorate methods — ${methodName} is not a function.`);
    }
    const ctor = (target as { constructor: Function }).constructor;
    const bindingName =
      opts?.binding ?? `${(ctor as { name: string }).name.toUpperCase()}_${methodName.toUpperCase()}`;

    class AgentMethodWorkflow extends RoostWorkflow<unknown, WorkflowMethodPayload> {
      async run(event: WorkflowEvent<WorkflowMethodPayload>, step: WorkflowStep): Promise<unknown> {
        const args = event.payload.args ?? [];
        return original.call(this, step, ...args);
      }
    }
    Object.defineProperty(AgentMethodWorkflow, 'name', {
      value: opts?.name ?? `${(ctor as { name: string }).name}${capitalize(methodName)}Workflow`,
    });

    registrations.set(bindingName, {
      agentClass: ctor,
      methodName,
      bindingName,
      originalMethod: original,
      workflowClass: AgentMethodWorkflow as unknown as WorkflowEntrypointRegistration['workflowClass'],
    });

    descriptor.value = async function (this: WorkflowHost, ...args: unknown[]): Promise<WorkflowStartHandle> {
      const client = this.workflows?.get(bindingName);
      if (!client) throw new WorkflowClientNotRegisteredError(bindingName);
      const handle = await client.create({ params: { method: methodName, args } });
      return {
        workflowId: handle.id,
        status: () => handle.status(),
        abort: (reason?: string) => handle.abort(reason),
        pause: () => handle.pause(),
        resume: () => handle.resume(),
      };
    };
  };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
