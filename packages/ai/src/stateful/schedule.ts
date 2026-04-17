import { dispatchEvent, ScheduledMethodMissing } from '../events.js';

/**
 * Persisted schedule record. Storage-layout key: `sched:{id}`. Matches the
 * spec's Data Model; a superset of the fields we actually need today so
 * Phase 3+ can add cron idempotency metadata without a migration.
 */
export interface ScheduleRecord<T = unknown> {
  id: string;
  method: string;
  payload: T;
  type: 'cron' | 'delayed' | 'scheduled';
  /** Absolute unix-ms timestamp when the next fire should occur. */
  nextFireAt: number;
  /** Cron expression (type === 'cron'). */
  cron?: string;
  /** Seconds of delay (type === 'delayed'). */
  delayInSeconds?: number;
}

interface SchedulerStateLike {
  readonly storage: SchedulerStorage;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
}

interface SchedulerStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}

export type ScheduleWhen = Date | string | number;

/**
 * Runs alongside a `StatefulAgent` and persists schedules in DO storage.
 * Fire-time is driven by the DO alarm system: the nearest pending schedule
 * sets the alarm; when the alarm fires, all due schedules run and the next
 * alarm is set.
 */
export class Scheduler {
  constructor(private readonly state: SchedulerStateLike, private readonly now: () => number = () => Date.now()) {}

  async schedule<T>(when: ScheduleWhen, method: string, payload: T): Promise<string> {
    const { type, nextFireAt, cron, delayInSeconds } = resolveWhen(when, this.now());
    const existing = await this.findDuplicate(method, payload, type, cron ?? null);
    if (existing) return existing.id;

    const record: ScheduleRecord<T> = {
      id: newScheduleId(),
      method,
      payload,
      type,
      nextFireAt,
      cron,
      delayInSeconds,
    };
    await this.state.storage.put(scheduleKey(record.id), record);
    await this.rescheduleAlarm();
    return record.id;
  }

  async cancel(scheduleId: string): Promise<boolean> {
    const existed = await this.state.storage.delete(scheduleKey(scheduleId));
    if (existed) await this.rescheduleAlarm();
    return existed;
  }

  async get<T = unknown>(scheduleId: string): Promise<ScheduleRecord<T> | undefined> {
    return this.state.storage.get<ScheduleRecord<T>>(scheduleKey(scheduleId));
  }

  async list<T = unknown>(): Promise<ScheduleRecord<T>[]> {
    const entries = await this.state.storage.list<ScheduleRecord<T>>({ prefix: 'sched:' });
    return Array.from(entries.values());
  }

  /**
   * Run every due schedule. Called from `StatefulAgent.alarm()`. Returns the
   * ids of schedules that actually fired; cron schedules are rescheduled in
   * place, one-shot schedules are deleted.
   */
  async runDue(
    invoke: (record: ScheduleRecord) => Promise<void>,
    onMissing: (record: ScheduleRecord) => Promise<void>,
  ): Promise<string[]> {
    const all = await this.list();
    const now = this.now();
    const fired: string[] = [];
    for (const record of all) {
      if (record.nextFireAt > now) continue;
      try {
        await invoke(record);
        fired.push(record.id);
      } catch (err) {
        if (isMissingMethodError(err)) {
          await onMissing(record);
          await this.state.storage.delete(scheduleKey(record.id));
          continue;
        }
        throw err;
      }

      if (record.type === 'cron' && record.cron) {
        const next = nextCronFire(record.cron, now);
        await this.state.storage.put(scheduleKey(record.id), { ...record, nextFireAt: next });
      } else {
        await this.state.storage.delete(scheduleKey(record.id));
      }
    }
    await this.rescheduleAlarm();
    return fired;
  }

  private async rescheduleAlarm(): Promise<void> {
    const all = await this.list();
    if (all.length === 0) {
      await this.state.deleteAlarm();
      return;
    }
    const next = all.reduce((min, r) => Math.min(min, r.nextFireAt), Infinity);
    if (!Number.isFinite(next)) {
      await this.state.deleteAlarm();
      return;
    }
    await this.state.setAlarm(next);
  }

  private async findDuplicate(
    method: string,
    payload: unknown,
    type: ScheduleRecord['type'],
    cron: string | null,
  ): Promise<ScheduleRecord | undefined> {
    if (type !== 'cron') return undefined;
    const all = await this.list();
    const payloadJson = JSON.stringify(payload ?? null);
    return all.find(
      (r) => r.method === method && r.cron === cron && JSON.stringify(r.payload ?? null) === payloadJson,
    );
  }
}

export class MissingScheduledMethodError extends Error {
  override readonly name = 'MissingScheduledMethodError';
  constructor(public readonly method: string) {
    super(`Scheduled method '${method}' not found on agent`);
  }
}

export async function dispatchScheduledMethodMissing(
  agentName: string,
  record: ScheduleRecord,
): Promise<void> {
  await dispatchEvent(
    ScheduledMethodMissing,
    new ScheduledMethodMissing(agentName, record.id, record.method),
  );
}

function scheduleKey(id: string): string {
  return `sched:${id}`;
}

let scheduleCounter = 0;
function newScheduleId(): string {
  scheduleCounter = (scheduleCounter + 1) % 1_000_000;
  return `sched_${Date.now().toString(36)}_${scheduleCounter.toString(36)}`;
}

function isMissingMethodError(err: unknown): err is MissingScheduledMethodError {
  return err instanceof MissingScheduledMethodError;
}

function resolveWhen(when: ScheduleWhen, now: number): {
  type: ScheduleRecord['type'];
  nextFireAt: number;
  cron?: string;
  delayInSeconds?: number;
} {
  if (when instanceof Date) return { type: 'scheduled', nextFireAt: when.getTime() };
  if (typeof when === 'number') return { type: 'delayed', nextFireAt: now + when * 1000, delayInSeconds: when };
  // Minimal cron: supports "* * * * *" syntax with whole-minute next-fire.
  // Full cron semantics ship in a follow-up; this is the documented MVP surface.
  const next = nextCronFire(when, now);
  return { type: 'cron', nextFireAt: next, cron: when };
}

/**
 * Compute the next fire time for a cron expression. Supports a deliberately
 * small subset:
 *   - `*` wildcard in every field
 *   - Exact numeric values in minute/hour/day/month/weekday
 *   - `*` always matches; numeric values match exactly
 * Returns the unix-ms of the next matching minute boundary after `now`.
 */
export function nextCronFire(cron: string, now: number): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: '${cron}' (expected 5 fields)`);
  const [min, hour, day, month, weekday] = parts;

  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  for (let step = 0; step < 60 * 24 * 31; step++) {
    const candidate = new Date(start.getTime() + step * 60_000);
    if (!matches(min, candidate.getUTCMinutes())) continue;
    if (!matches(hour, candidate.getUTCHours())) continue;
    if (!matches(day, candidate.getUTCDate())) continue;
    if (!matches(month, candidate.getUTCMonth() + 1)) continue;
    if (!matches(weekday, candidate.getUTCDay())) continue;
    return candidate.getTime();
  }
  // Fallback: fire in one day.
  return now + 24 * 60 * 60 * 1000;
}

function matches(field: string, value: number): boolean {
  if (field === '*') return true;
  return Number(field) === value;
}

export type { SchedulerStateLike, SchedulerStorage };