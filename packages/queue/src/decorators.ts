import type { BackoffStrategy, JobConfig } from './types.js';
import { DEFAULT_JOB_CONFIG } from './types.js';

function ensureConfig(target: any): JobConfig {
  if (!Object.prototype.hasOwnProperty.call(target, '_jobConfig')) {
    target._jobConfig = { ...DEFAULT_JOB_CONFIG };
  }
  return target._jobConfig;
}

export function Queue(name: string) {
  return (target: any) => { ensureConfig(target).queue = name; };
}

export function Delay(seconds: number) {
  return (target: any) => { ensureConfig(target).delay = seconds; };
}

export function MaxRetries(n: number) {
  return (target: any) => { ensureConfig(target).maxRetries = n; };
}

export function RetryAfter(seconds: number) {
  return (target: any) => { ensureConfig(target).retryAfter = seconds; };
}

export function Backoff(strategy: BackoffStrategy) {
  return (target: any) => { ensureConfig(target).backoff = strategy; };
}

export function JobTimeout(seconds: number) {
  return (target: any) => { ensureConfig(target).timeout = seconds; };
}

export function getJobConfig(target: any): JobConfig {
  return target._jobConfig ?? { ...DEFAULT_JOB_CONFIG };
}
