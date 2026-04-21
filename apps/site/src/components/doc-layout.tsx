import { Link, useLocation } from '@tanstack/react-router';
import { useState, useEffect, type ReactNode } from 'react';
import { CopyMarkdownButton } from './copy-markdown-button';
import { DocJsonLd } from './doc-json-ld';

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
      { to: '/docs/tutorials/ai-agent-walkthrough', label: 'Build a Stateful AI Agent' },
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
      { to: '/docs/guides/core', label: '@roostjs/core' },
      { to: '/docs/guides/cloudflare', label: '@roostjs/cloudflare' },
      { to: '/docs/guides/start', label: '@roostjs/start' },
      { to: '/docs/guides/auth', label: '@roostjs/auth' },
      { to: '/docs/guides/orm', label: '@roostjs/orm' },
      { to: '/docs/guides/ai', label: '@roostjs/ai' },
      { to: '/docs/guides/broadcast', label: '@roostjs/broadcast' },
      { to: '/docs/guides/events', label: '@roostjs/events' },
      { to: '/docs/guides/feature-flags', label: '@roostjs/feature-flags' },
      { to: '/docs/guides/mcp', label: '@roostjs/mcp' },
      { to: '/docs/guides/billing', label: '@roostjs/billing' },
      { to: '/docs/guides/queue', label: '@roostjs/queue' },
      { to: '/docs/guides/workflow', label: '@roostjs/workflow' },
      { to: '/docs/guides/cli', label: '@roostjs/cli' },
      { to: '/docs/guides/testing', label: '@roostjs/testing' },
      { to: '/docs/guides/schema', label: '@roostjs/schema' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { to: '/docs/reference', label: 'All Reference' },
      { to: '/docs/reference/core', label: '@roostjs/core' },
      { to: '/docs/reference/cloudflare', label: '@roostjs/cloudflare' },
      { to: '/docs/reference/start', label: '@roostjs/start' },
      { to: '/docs/reference/auth', label: '@roostjs/auth' },
      { to: '/docs/reference/orm', label: '@roostjs/orm' },
      { to: '/docs/reference/ai', label: '@roostjs/ai' },
      { to: '/docs/reference/broadcast', label: '@roostjs/broadcast' },
      { to: '/docs/reference/events', label: '@roostjs/events' },
      { to: '/docs/reference/feature-flags', label: '@roostjs/feature-flags' },
      { to: '/docs/reference/mcp', label: '@roostjs/mcp' },
      { to: '/docs/reference/billing', label: '@roostjs/billing' },
      { to: '/docs/reference/queue', label: '@roostjs/queue' },
      { to: '/docs/reference/workflow', label: '@roostjs/workflow' },
      { to: '/docs/reference/cli', label: '@roostjs/cli' },
      { to: '/docs/reference/testing', label: '@roostjs/testing' },
      { to: '/docs/reference/schema', label: '@roostjs/schema' },
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
      { to: '/docs/concepts/core', label: '@roostjs/core' },
      { to: '/docs/concepts/cloudflare', label: '@roostjs/cloudflare' },
      { to: '/docs/concepts/start', label: '@roostjs/start' },
      { to: '/docs/concepts/auth', label: '@roostjs/auth' },
      { to: '/docs/concepts/orm', label: '@roostjs/orm' },
      { to: '/docs/concepts/ai', label: '@roostjs/ai' },
      { to: '/docs/concepts/broadcast', label: '@roostjs/broadcast' },
      { to: '/docs/concepts/events', label: '@roostjs/events' },
      { to: '/docs/concepts/feature-flags', label: '@roostjs/feature-flags' },
      { to: '/docs/concepts/mcp', label: '@roostjs/mcp' },
      { to: '/docs/concepts/billing', label: '@roostjs/billing' },
      { to: '/docs/concepts/queue', label: '@roostjs/queue' },
      { to: '/docs/concepts/workflow', label: '@roostjs/workflow' },
      { to: '/docs/concepts/cli', label: '@roostjs/cli' },
      { to: '/docs/concepts/testing', label: '@roostjs/testing' },
      { to: '/docs/concepts/schema', label: '@roostjs/schema' },
    ],
  },
] as const;

function normalize(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

const collapsibleSections = new Set(['Guides', 'Reference', 'Concepts']);

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const currentPath = normalize(location.pathname);

  // Determine which sections should be open: always-open sections + section containing active page
  const activeSectionTitle = sections.find((s) =>
    s.links.some((l) => currentPath === normalize(l.to))
  )?.title;

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((s) => {
      if (!collapsibleSections.has(s.title)) initial.add(s.title);
    });
    if (activeSectionTitle) initial.add(activeSectionTitle);
    return initial;
  });

  // Update open sections when the active page changes
  useEffect(() => {
    if (activeSectionTitle && !openSections.has(activeSectionTitle)) {
      setOpenSections((prev) => new Set([...prev, activeSectionTitle]));
    }
  }, [activeSectionTitle]);

  function toggleSection(title: string) {
    if (!collapsibleSections.has(title)) return;
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

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
          {sections.map((section) => {
            const isCollapsible = collapsibleSections.has(section.title);
            const isOpen = openSections.has(section.title);

            return (
              <div key={section.title} className="sidebar-section">
                {isCollapsible ? (
                  <button
                    className="sidebar-section-toggle"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={isOpen}
                  >
                    <span className="sidebar-section-title">{section.title}</span>
                    <svg className={`sidebar-chevron${isOpen ? ' open' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                ) : (
                  <div className="sidebar-section-title">{section.title}</div>
                )}
                <div className={`sidebar-links${isOpen ? ' open' : ''}`}>
                  <div className="sidebar-links-inner">
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
                </div>
              </div>
            );
          })}
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
  const location = useLocation();
  const isDocsPage = location.pathname.startsWith('/docs/');
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
      {isDocsPage && <DocJsonLd title={title} description={subtitle} url={`https://roost.birdcar.dev${location.pathname}`} />}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="docs-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          {isDocsPage && <CopyMarkdownButton path={location.pathname} />}
        </div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </main>
      <TableOfContents items={tocItems} activeId={activeId} />
    </div>
  );
}
