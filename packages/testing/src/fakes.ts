export function fakeAll(): void {
  try { const { Agent } = require('@roost/ai'); Agent.fake?.(); } catch {}
  try { const { Billing } = require('@roost/billing'); Billing.fake?.(); } catch {}
  try { const { Job } = require('@roost/queue'); Job.fake?.(); } catch {}
}

export function restoreAll(): void {
  try { const { Agent } = require('@roost/ai'); Agent.restore?.(); } catch {}
  try { const { Billing } = require('@roost/billing'); Billing.restore?.(); } catch {}
  try { const { Job } = require('@roost/queue'); Job.restore?.(); } catch {}
}
