export interface Listener<T = unknown> {
  handle(event: T): void | Promise<void>;
}

/**
 * Marker interface: apply to a Listener class to have it dispatched as a Job
 * instead of called synchronously. Classes implementing ShouldQueue must also
 * extend Job<TEvent> from @roostjs/queue.
 */
export interface ShouldQueue {
  readonly shouldQueue: true;
}
