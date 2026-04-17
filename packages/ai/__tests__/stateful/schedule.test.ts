import { describe, it, expect } from 'bun:test';
import { Scheduler, nextCronFire } from '../../src/stateful/schedule.js';
import { MockDurableObjectState } from '../../src/testing/mock-do-state.js';

function setup(nowMs = Date.parse('2026-04-17T09:00:00Z')) {
  const state = new MockDurableObjectState();
  const clock = { now: nowMs };
  const scheduler = new Scheduler(state, () => clock.now);
  return { state, scheduler, clock };
}

describe('Scheduler.schedule (delay)', () => {
  it('persists a delayed schedule and sets the alarm to its fire time', async () => {
    const { state, scheduler, clock } = setup();
    const id = await scheduler.schedule(30, 'tick', { x: 1 });
    const record = await scheduler.get(id);
    expect(record?.type).toBe('delayed');
    expect(record?.nextFireAt).toBe(clock.now + 30_000);
    expect(await state.getAlarm()).toBe(clock.now + 30_000);
  });

  it('persists a Date-scheduled task', async () => {
    const { scheduler } = setup();
    const future = new Date('2027-01-01T00:00:00Z');
    const id = await scheduler.schedule(future, 'yearEnd');
    const record = await scheduler.get(id);
    expect(record?.type).toBe('scheduled');
    expect(record?.nextFireAt).toBe(future.getTime());
  });
});

describe('Scheduler.schedule (cron)', () => {
  it('dedupes identical cron schedules for the same method + payload', async () => {
    const { scheduler } = setup();
    const a = await scheduler.schedule('0 9 * * *', 'digest', 'daily');
    const b = await scheduler.schedule('0 9 * * *', 'digest', 'daily');
    expect(a).toBe(b);
  });

  it('creates a distinct record when the cron or payload differs', async () => {
    const { scheduler } = setup();
    const a = await scheduler.schedule('0 9 * * *', 'digest', 'daily');
    const b = await scheduler.schedule('0 9 * * *', 'digest', 'weekly');
    expect(a).not.toBe(b);
  });
});

describe('Scheduler.cancel', () => {
  it('removes the schedule and updates the alarm to the next-pending fire', async () => {
    const { state, scheduler } = setup();
    const first = await scheduler.schedule(30, 'a');
    const second = await scheduler.schedule(60, 'b');
    await scheduler.cancel(first);
    const alarm = await state.getAlarm();
    const remaining = await scheduler.get(second);
    expect(alarm).toBe(remaining?.nextFireAt ?? -1);
  });

  it('returns false for an unknown schedule id', async () => {
    const { scheduler } = setup();
    expect(await scheduler.cancel('missing')).toBe(false);
  });
});

describe('Scheduler.runDue', () => {
  it('fires every schedule whose nextFireAt has passed', async () => {
    const { scheduler, clock } = setup();
    await scheduler.schedule(10, 'a');
    await scheduler.schedule(20, 'b');
    await scheduler.schedule(120, 'later');

    clock.now += 30_000;
    const fired: string[] = [];
    const result = await scheduler.runDue(
      async (r) => { fired.push(r.method); },
      async () => {},
    );

    expect(result.length).toBe(2);
    expect(fired.sort()).toEqual(['a', 'b']);
  });

  it('reschedules cron entries instead of deleting them', async () => {
    const { scheduler, clock } = setup(Date.parse('2026-04-17T08:59:59Z'));
    const id = await scheduler.schedule('0 9 * * *', 'digest');
    const before = await scheduler.get(id);

    clock.now = before!.nextFireAt + 1;
    await scheduler.runDue(async () => {}, async () => {});

    const after = await scheduler.get(id);
    expect(after).toBeDefined();
    expect(after!.nextFireAt).toBeGreaterThan(before!.nextFireAt);
  });
});

describe('nextCronFire', () => {
  it('rejects malformed cron expressions', () => {
    expect(() => nextCronFire('invalid', Date.now())).toThrow(/Invalid cron/);
  });

  it('computes 09:00 UTC for a "0 9 * * *" cron entry scheduled before 9am', () => {
    const from = Date.parse('2026-04-17T08:30:00Z');
    const next = nextCronFire('0 9 * * *', from);
    expect(new Date(next).toISOString()).toBe('2026-04-17T09:00:00.000Z');
  });
});