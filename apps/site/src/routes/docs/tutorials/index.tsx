import { createFileRoute, Link } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/tutorials/')({ component: Page });

function Page() {
  return (
    <DocLayout title="Tutorials" subtitle="Learning-oriented lessons that guide you through building real features with Roost.">
      <p>
        Tutorials take you step-by-step through building something real. Every step is designed to
        succeed — follow along and learn by doing.
      </p>

      <h2>Start Here</h2>
      <ul>
        <li>
          <Link to="/docs/getting-started"><strong>Quick Start</strong></Link> — Install the CLI, scaffold a project, add a route, create a model, and deploy. <em>~15 minutes.</em>
        </li>
      </ul>

      <h2>Build Something Real</h2>
      <ul>
        <li>
          <Link to="/docs/tutorials/build-a-chat-app"><strong>Build an AI Chat App</strong></Link> — Create a chat interface powered by Cloudflare Workers AI with conversation history stored in D1. <em>~30 minutes. Uses @roost/ai, @roost/orm, @roost/start, @roost/schema.</em>
        </li>
        <li>
          <Link to="/docs/tutorials/build-a-task-api"><strong>Build a REST API</strong></Link> — Create a CRUD API with database models, validation, and tests. <em>~35 minutes. Uses @roost/orm, @roost/core, @roost/testing, @roost/start.</em>
        </li>
        <li>
          <Link to="/docs/tutorials/build-a-saas-app"><strong>Build a SaaS App</strong></Link> — Add authentication, subscription billing, and background jobs. <em>~45 minutes. Uses @roost/auth, @roost/billing, @roost/orm, @roost/start, @roost/queue.</em>
        </li>
      </ul>

      <h2>Deploy</h2>
      <ul>
        <li>
          <Link to="/docs/tutorials/deploy-to-cloudflare"><strong>Deploy to Cloudflare</strong></Link> — Take your app from local development to production on Cloudflare Workers. <em>~20 minutes. Uses @roost/cloudflare, @roost/start, @roost/cli.</em>
        </li>
      </ul>
    </DocLayout>
  );
}
