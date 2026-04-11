import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/concepts/queue')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/queue" subtitle="How Cloudflare Queues work, the job lifecycle from dispatch to completion, retry strategies, and why queues beat cron for deferred work.">
      <h2>How Cloudflare Queues Work</h2>
      <p>
        Cloudflare Queues are a message queue service built on top of the Workers platform.
        A producer Worker sends messages to a queue; a consumer Worker is triggered to process
        those messages. The consumer and producer can be the same Worker or different ones.
        Queues deliver messages in batches, and the consumer processes each batch within a
        single Worker invocation.
      </p>
      <p>
        The key difference from traditional message queues like RabbitMQ or SQS is that Queues
        are a first-class Cloudflare Workers binding. No external connection string, no broker
        to configure, no egress costs for messages within Cloudflare's network. The queue is
        declared in <code>wrangler.toml</code>, and the Worker accesses it through
        <code>env.QUEUE_NAME</code> like any other binding.
      </p>

      <h2>Job Lifecycle</h2>
      <p>
        Roost models queue work as <code>Job</code> classes. The lifecycle has clear stages.
        First, application code calls <code>SomeJob.dispatch(payload)</code>. The job is
        serialized and sent to the Cloudflare Queue. Cloudflare delivers the message to the
        consumer Worker, which calls <code>job.handle()</code>. If <code>handle()</code>
        completes without throwing, <code>job.onSuccess()</code> is called if defined.
        If <code>handle()</code> throws, <code>job.onFailure(error)</code> is called and
        the job is eligible for retry.
      </p>
      <p>
        Jobs are plain TypeScript classes: a typed <code>payload</code> property and an
        abstract <code>handle()</code> method. Job configuration — retry count, delay,
        timeout — lives on the class via static properties or decorators, not in the dispatch
        call. This keeps dispatch sites clean and configuration close to the job definition.
      </p>

      <h2>Retry With Backoff</h2>
      <p>
        Transient failures — a downstream API that is temporarily unavailable, a database
        contention issue — should be retried. Permanent failures — invalid payload data,
        a business rule violation — should not. Roost's retry model relies on the distinction
        between these: if <code>handle()</code> throws, the job is retried up to the configured
        maximum attempts. Jobs that have reached their maximum attempts are considered permanently
        failed and trigger <code>onFailure</code> with the last error.
      </p>
      <p>
        Cloudflare Queues handles the retry scheduling on the infrastructure side — Roost does
        not need to implement backoff timers. The platform increases the delay between retries
        automatically. For jobs that need to signal a permanent failure without exhausting all
        retries, the pattern is to catch the error in <code>handle()</code>, perform cleanup,
        and not rethrow — the job completes "successfully" from the queue's perspective, but
        the application has handled the failure gracefully.
      </p>

      <h2>Why Not Cron Triggers for Recurring Work</h2>
      <p>
        Cloudflare Workers supports cron triggers — scheduled invocations at defined intervals.
        For truly periodic work (daily report generation, weekly digest emails), cron triggers
        are appropriate. But many tasks that are modeled as recurring are better modeled as
        event-driven. Sending a welcome email when a user registers is not "send an email every
        time we check for new users" — it is "react to the user.registered event."
      </p>
      <p>
        Queue jobs are event-driven: something happened, dispatch a job that handles it.
        This model is more precise, easier to test (dispatch happens explicitly in code),
        and less likely to create work-doubling bugs where a cron trigger runs more often
        than expected or processes the same event twice. Cron triggers are still useful for
        jobs with no triggering event, but they should not be the default.
      </p>

      <h2>Further Reading</h2>
      <ul>
        <li><a href="/docs/packages/queue">@roost/queue reference — Job, dispatch, and consumer API</a></li>
        <li><a href="/docs/concepts/testing-philosophy">Testing Philosophy — Job.fake() and how queue testing works</a></li>
        <li><a href="https://developers.cloudflare.com/queues/" target="_blank" rel="noopener noreferrer">Cloudflare Queues Documentation</a></li>
      </ul>
    </DocLayout>
  );
}
