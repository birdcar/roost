import { createFileRoute, Link } from '@tanstack/react-router';
import { DocLayout } from '../../components/doc-layout';

export const Route = createFileRoute('/docs/')({
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <DocLayout
      title="Roost Documentation"
      subtitle="A Laravel-inspired TypeScript framework for Cloudflare Workers."
    >
      <p>
        Roost gives you auth, ORM, AI agents, job queues, billing, and more — all running on
        Cloudflare Workers with zero cold-start overhead.
      </p>

      <div className="pillar-grid">
        <Link to="/docs/tutorials" className="pillar-card">
          <h3>Learning Roost?</h3>
          <p>Step-by-step tutorials that guide you through building real features from scratch.</p>
          <span className="pillar-link">Browse tutorials</span>
        </Link>

        <Link to="/docs/guides" className="pillar-card">
          <h3>Building something?</h3>
          <p>Task-oriented guides for accomplishing specific goals — migrations, deployment, auth, and more.</p>
          <span className="pillar-link">Browse guides</span>
        </Link>

        <Link to="/docs/reference" className="pillar-card">
          <h3>Looking something up?</h3>
          <p>Complete API reference for every package, class, and method in the framework.</p>
          <span className="pillar-link">Browse reference</span>
        </Link>

        <Link to="/docs/concepts" className="pillar-card">
          <h3>Want to understand why?</h3>
          <p>Architecture explanations, design decisions, and the thinking behind each package.</p>
          <span className="pillar-link">Browse concepts</span>
        </Link>
      </div>

      <h2>New to Roost?</h2>
      <p>
        Start with the <Link to="/docs/getting-started">Quick Start</Link> — install the CLI,
        scaffold a project, and deploy your first app in minutes.
      </p>

    </DocLayout>
  );
}
