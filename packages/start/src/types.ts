import type { Container } from '@roost/core';
import type { Application } from '@roost/core';

export interface RoostServerContext {
  container: Container;
  app: Application;
}
