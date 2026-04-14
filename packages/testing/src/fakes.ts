export function fakeAll(): void {
  try { const { Agent } = require('@roostjs/ai'); Agent.fake?.(); } catch {}
  try { const { Billing } = require('@roostjs/billing'); Billing.fake?.(); } catch {}
  try { const { Job } = require('@roostjs/queue'); Job.fake?.(); } catch {}
}

export function restoreAll(): void {
  try { const { Agent } = require('@roostjs/ai'); Agent.restore?.(); } catch {}
  try { const { Billing } = require('@roostjs/billing'); Billing.restore?.(); } catch {}
  try { const { Job } = require('@roostjs/queue'); Job.restore?.(); } catch {}
}
