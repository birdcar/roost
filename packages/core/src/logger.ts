export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}

export interface LogEntry extends LogContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export class Logger {
  constructor(protected context: LogContext) {}

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ...this.context,
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    };
    console.log(JSON.stringify(entry));
  }

  static fake(context?: Partial<LogContext>): FakeLogger {
    return new FakeLogger({
      requestId: 'fake-request-id',
      method: 'GET',
      path: '/',
      ...context,
    });
  }
}

export class FakeLogger extends Logger {
  readonly entries: LogEntry[] = [];

  info(message: string, data?: Record<string, unknown>): void {
    this.record('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.record('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.record('error', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.record('debug', message, data);
  }

  assertLogged(level: LogLevel, message: string): void {
    const found = this.entries.some(
      (e) => e.level === level && e.message.includes(message)
    );
    if (!found) {
      throw new Error(
        `Expected a "${level}" log containing "${message}" but found none. Logged: ${JSON.stringify(this.entries.map((e) => `[${e.level}] ${e.message}`))}`
      );
    }
  }

  assertNotLogged(level: LogLevel): void {
    const found = this.entries.filter((e) => e.level === level);
    if (found.length > 0) {
      throw new Error(
        `Expected no "${level}" logs but found ${found.length}: ${JSON.stringify(found.map((e) => e.message))}`
      );
    }
  }

  restore(): void {
    this.entries.length = 0;
  }

  private record(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    this.entries.push({
      ...this.context,
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    });
  }
}
