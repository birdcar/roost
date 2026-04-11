import { Link, useLocation } from '@tanstack/react-router';
import { useState, useEffect, type ReactNode } from 'react';

const sections = [
  {
    title: 'Overview',
    links: [
      { to: '/docs', label: 'Introduction' },
      { to: '/docs/getting-started', label: 'Quick Start' },
    ],
  },
  {
    title: 'Tutorials',
    links: [
      { to: '/docs/tutorials', label: 'All Tutorials' },
      { to: '/docs/tutorials/build-a-chat-app', label: 'Build an AI Chat App' },
      { to: '/docs/tutorials/build-a-saas-app', label: 'Build a SaaS App' },
      { to: '/docs/tutorials/build-a-task-api', label: 'Build a REST API' },
      { to: '/docs/tutorials/deploy-to-cloudflare', label: 'Deploy to Cloudflare' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { to: '/docs/guides', label: 'All Guides' },
      { to: '/docs/guides/migrations', label: 'Migrations' },
      { to: '/docs/guides/deployment', label: 'Deployment' },
      { to: '/docs/guides/environment', label: 'Environment' },
      { to: '/docs/guides/error-handling', label: 'Error Handling' },
      { to: '/docs/guides/core', label: '@roost/core' },
      { to: '/docs/guides/cloudflare', label: '@roost/cloudflare' },
      { to: '/docs/guides/start', label: '@roost/start' },
      { to: '/docs/guides/auth', label: '@roost/auth' },
      { to: '/docs/guides/orm', label: '@roost/orm' },
      { to: '/docs/guides/ai', label: '@roost/ai' },
      { to: '/docs/guides/mcp', label: '@roost/mcp' },
      { to: '/docs/guides/billing', label: '@roost/billing' },
      { to: '/docs/guides/queue', label: '@roost/queue' },
      { to: '/docs/guides/cli', label: '@roost/cli' },
      { to: '/docs/guides/testing', label: '@roost/testing' },
      { to: '/docs/guides/schema', label: '@roost/schema' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { to: '/docs/reference', label: 'All Reference' },
      { to: '/docs/reference/core', label: '@roost/core' },
      { to: '/docs/reference/cloudflare', label: '@roost/cloudflare' },
      { to: '/docs/reference/start', label: '@roost/start' },
      { to: '/docs/reference/auth', label: '@roost/auth' },
      { to: '/docs/reference/orm', label: '@roost/orm' },
      { to: '/docs/reference/ai', label: '@roost/ai' },
      { to: '/docs/reference/mcp', label: '@roost/mcp' },
      { to: '/docs/reference/billing', label: '@roost/billing' },
      { to: '/docs/reference/queue', label: '@roost/queue' },
      { to: '/docs/reference/cli', label: '@roost/cli' },
      { to: '/docs/reference/testing', label: '@roost/testing' },
      { to: '/docs/reference/schema', label: '@roost/schema' },
    ],
  },
  {
    title: 'Concepts',
    links: [
      { to: '/docs/concepts', label: 'All Concepts' },
      { to: '/docs/concepts/architecture', label: 'Architecture' },
      { to: '/docs/concepts/service-container', label: 'Service Container' },
      { to: '/docs/concepts/edge-computing', label: 'Edge Computing' },
      { to: '/docs/concepts/laravel-patterns', label: 'Laravel Patterns' },
      { to: '/docs/concepts/testing-philosophy', label: 'Testing Philosophy' },
      { to: '/docs/concepts/core', label: '@roost/core' },
      { to: '/docs/concepts/cloudflare', label: '@roost/cloudflare' },
      { to: '/docs/concepts/start', label: '@roost/start' },
      { to: '/docs/concepts/auth', label: '@roost/auth' },
      { to: '/docs/concepts/orm', label: '@roost/orm' },
      { to: '/docs/concepts/ai', label: '@roost/ai' },
      { to: '/docs/concepts/mcp', label: '@roost/mcp' },
      { to: '/docs/concepts/billing', label: '@roost/billing' },
      { to: '/docs/concepts/queue', label: '@roost/queue' },
      { to: '/docs/concepts/cli', label: '@roost/cli' },
      { to: '/docs/concepts/testing', label: '@roost/testing' },
      { to: '/docs/concepts/schema', label: '@roost/schema' },
    ],
  },
] as const;

function normalize(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const currentPath = normalize(location.pathname);

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.2)',
            zIndex: 40,
          }}
        />
      )}
      <aside className={`docs-sidebar${isOpen ? ' open' : ''}`}>
        <nav>
          {sections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.links.map((link) => {
                const isActive = currentPath === normalize(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    activeOptions={{ exact: true }}
                    activeProps={{}}
                    inactiveProps={{}}
                    onClick={onClose}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function TableOfContents({ items, activeId }: { items: TocItem[]; activeId: string }) {
  if (items.length < 3) return null;

  return (
    <aside className="docs-toc">
      <div className="toc-title">On this page</div>
      <nav>
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`toc-link${item.level === 3 ? ' toc-sub' : ''}${activeId === item.id ? ' active' : ''}`}
          >
            {item.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function DocLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  // Process headings after hydration via direct DOM query
  useEffect(() => {
    function process() {
      const el = document.querySelector('.docs-content');
      if (!el) return;

      const headings = el.querySelectorAll('h2, h3');
      if (headings.length === 0) return;

      const items: TocItem[] = [];

      headings.forEach((heading) => {
        const text = heading.textContent?.replace(/#$/, '').trim() ?? '';
        if (!text) return;
        const id = slugify(text);
        heading.id = id;

        items.push({
          id,
          text,
          level: heading.tagName === 'H3' ? 3 : 2,
        });

        if (heading.querySelector('.heading-anchor')) return;
        const anchor = document.createElement('a');
        anchor.href = `#${id}`;
        anchor.className = 'heading-anchor';
        anchor.textContent = '#';
        anchor.setAttribute('aria-label', `Link to ${text}`);
        heading.appendChild(anchor);
      });

      setTocItems(items);
    }

    // Double rAF ensures we run after TanStack Start's hydration completes
    requestAnimationFrame(() => requestAnimationFrame(process));
  }, [title]);

  // Scroll spy for TOC
  useEffect(() => {
    function handleScroll() {
      const el = document.querySelector('.docs-content');
      if (!el) return;
      const headings = el.querySelectorAll('h2[id], h3[id]');
      let current = '';
      headings.forEach((heading) => {
        if (heading.getBoundingClientRect().top <= 100) {
          current = heading.id;
        }
      });
      setActiveId(current);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tocItems]);

  return (
    <div className="docs-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="docs-content">
        <button
          className="nav-toggle mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>Menu</span>
        </button>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </main>
      <TableOfContents items={tocItems} activeId={activeId} />
    </div>
  );
}
