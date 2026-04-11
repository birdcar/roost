import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Roost SaaS Starter</h1>
      <p>A multi-tenant SaaS application built with Roost.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '2rem' }}>
        <FeatureCard title="Multi-Tenant Auth" description="WorkOS organizations with role-based access control" />
        <FeatureCard title="Stripe Billing" description="Subscriptions, trials, and customer portal" />
        <FeatureCard title="Background Jobs" description="Queue processing via Cloudflare Queues" />
        <FeatureCard title="R2 File Storage" description="Document uploads with presigned URLs" />
      </div>

      <a href="/dashboard" style={{ display: 'inline-block', marginTop: '2rem', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', borderRadius: '6px', textDecoration: 'none' }}>
        Go to Dashboard
      </a>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem' }}>{title}</h3>
      <p style={{ margin: 0, color: '#666' }}>{description}</p>
    </div>
  );
}
