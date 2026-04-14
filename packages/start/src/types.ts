import type { Container } from '@roostjs/core';
import type { Application } from '@roostjs/core';

export interface RoostServerContext {
  container: Container;
  app: Application;
}
