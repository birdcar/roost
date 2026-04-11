import { createServerFn } from '@tanstack/react-start';
import type { RoostServerContext } from './types.js';

/**
 * Creates a TanStack Start server function with Roost context pre-injected
 * and no input data. The function body receives the RoostServerContext,
 * giving access to the scoped service container and Application.
 *
 * @example
 * ```typescript
 * export const listUsers = roostFn(roostMiddleware, async (roost) => {
 *   const users = roost.container.resolve(UserService);
 *   return users.findAll();
 * });
 * ```
 */
export function roostFn<TOutput>(
  middleware: any,
  fn: (roost: RoostServerContext) => Promise<TOutput>
) {
  return createServerFn({ method: 'GET' })
    .middleware([middleware])
    .handler(async ({ context }: any): Promise<any> => {
      return fn(context.roost);
    });
}

/**
 * Creates a TanStack Start server function with Roost context pre-injected
 * and typed input data via a validator function.
 *
 * @example
 * ```typescript
 * export const getUser = roostFnWithInput(
 *   roostMiddleware,
 *   (d: { userId: string }) => d,
 *   async (roost, input) => {
 *     const users = roost.container.resolve(UserService);
 *     return users.findById(input.userId);
 *   }
 * );
 * ```
 */
export function roostFnWithInput<TInput, TOutput>(
  middleware: any,
  validator: (input: TInput) => TInput,
  fn: (roost: RoostServerContext, input: TInput) => Promise<TOutput>
) {
  return createServerFn({ method: 'POST' })
    .middleware([middleware])
    .inputValidator(validator as any)
    .handler(async ({ context, data }: any): Promise<any> => {
      return fn(context.roost, data);
    });
}
