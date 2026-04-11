import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

interface SearchEntry {
  title: string;
  section?: string;
  path: string;
  hash?: string;
}

const searchIndex: SearchEntry[] = [
  // Overview
  { title: 'Introduction', path: '/docs' },
  { title: 'Getting Started', path: '/docs/getting-started' },

  // Tutorial pages
  { title: 'Tutorials', path: '/docs/tutorials' },
  { title: 'Build an AI Chat App', section: 'Tutorials', path: '/docs/tutorials/build-a-chat-app' },
  { title: 'Build a SaaS App', section: 'Tutorials', path: '/docs/tutorials/build-a-saas-app' },
  { title: 'Build a REST API', section: 'Tutorials', path: '/docs/tutorials/build-a-task-api' },
  { title: 'Deploy to Cloudflare', section: 'Tutorials', path: '/docs/tutorials/deploy-to-cloudflare' },

  // Pillar landing pages
  { title: 'How-to Guides', path: '/docs/guides' },
  { title: 'Reference', path: '/docs/reference' },
  { title: 'Concepts', path: '/docs/concepts' },

  // Reference pages
  { title: '@roost/core Reference', path: '/docs/reference/core' },
  { title: '@roost/cloudflare Reference', path: '/docs/reference/cloudflare' },
  { title: '@roost/start Reference', path: '/docs/reference/start' },
  { title: '@roost/auth Reference', path: '/docs/reference/auth' },
  { title: '@roost/orm Reference', path: '/docs/reference/orm' },
  { title: '@roost/ai Reference', path: '/docs/reference/ai' },
  { title: '@roost/mcp Reference', path: '/docs/reference/mcp' },
  { title: '@roost/billing Reference', path: '/docs/reference/billing' },
  { title: '@roost/queue Reference', path: '/docs/reference/queue' },
  { title: '@roost/cli Reference', path: '/docs/reference/cli' },
  { title: '@roost/testing Reference', path: '/docs/reference/testing' },
  { title: '@roost/schema Reference', path: '/docs/reference/schema' },

  // Guide pages
  { title: 'Migrations Guide', path: '/docs/guides/migrations' },
  { title: 'Deployment Guide', path: '/docs/guides/deployment' },
  { title: 'Environment Guide', path: '/docs/guides/environment' },
  { title: 'Error Handling Guide', path: '/docs/guides/error-handling' },
  { title: '@roost/core Guides', path: '/docs/guides/core' },
  { title: '@roost/cloudflare Guides', path: '/docs/guides/cloudflare' },
  { title: '@roost/start Guides', path: '/docs/guides/start' },
  { title: '@roost/auth Guides', path: '/docs/guides/auth' },
  { title: '@roost/orm Guides', path: '/docs/guides/orm' },
  { title: '@roost/ai Guides', path: '/docs/guides/ai' },
  { title: '@roost/mcp Guides', path: '/docs/guides/mcp' },
  { title: '@roost/billing Guides', path: '/docs/guides/billing' },
  { title: '@roost/queue Guides', path: '/docs/guides/queue' },
  { title: '@roost/cli Guides', path: '/docs/guides/cli' },
  { title: '@roost/testing Guides', path: '/docs/guides/testing' },
  { title: '@roost/schema Guides', path: '/docs/guides/schema' },

  // Concept pages — architecture
  { title: 'Application Architecture', path: '/docs/concepts/architecture' },
  { title: 'Service Container', path: '/docs/concepts/service-container' },
  { title: 'Edge Computing', path: '/docs/concepts/edge-computing' },
  { title: 'Laravel-Inspired Patterns', path: '/docs/concepts/laravel-patterns' },
  { title: 'Testing Philosophy', path: '/docs/concepts/testing-philosophy' },

  // Concept pages — per-package
  { title: '@roost/core Concepts', path: '/docs/concepts/core' },
  { title: '@roost/cloudflare Concepts', path: '/docs/concepts/cloudflare' },
  { title: '@roost/start Concepts', path: '/docs/concepts/start' },
  { title: '@roost/auth Concepts', path: '/docs/concepts/auth' },
  { title: '@roost/orm Concepts', path: '/docs/concepts/orm' },
  { title: '@roost/ai Concepts', path: '/docs/concepts/ai' },
  { title: '@roost/mcp Concepts', path: '/docs/concepts/mcp' },
  { title: '@roost/billing Concepts', path: '/docs/concepts/billing' },
  { title: '@roost/queue Concepts', path: '/docs/concepts/queue' },
  { title: '@roost/cli Concepts', path: '/docs/concepts/cli' },
  { title: '@roost/testing Concepts', path: '/docs/concepts/testing' },
  { title: '@roost/schema Concepts', path: '/docs/concepts/schema' },
];

function filterResults(query: string): SearchEntry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const scored = searchIndex
    .map((entry) => {
      const titleMatch = entry.title.toLowerCase().includes(q);
      const sectionMatch = entry.section?.toLowerCase().includes(q);
      let score = 0;
      if (entry.title.toLowerCase() === q) score = 100;
      else if (entry.title.toLowerCase().startsWith(q)) score = 80;
      else if (titleMatch) score = 60;
      else if (sectionMatch) score = 30;
      else return null;
      if (!entry.hash) score += 10;
      return { entry, score };
    })
    .filter(Boolean) as Array<{ entry: SearchEntry; score: number }>;

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.entry);
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const results = filterResults(query);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const go = useCallback((entry: SearchEntry) => {
    const url = entry.hash ? `${entry.path}#${entry.hash}` : entry.path;
    navigate({ to: url });
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      go(results[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selected, go, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="search-overlay" onClick={onClose} />
      <div className="search-modal" role="dialog" aria-label="Search documentation">
        <div className="search-input-wrap">
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search docs..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="search-kbd">esc</kbd>
        </div>
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((entry, i) => (
              <li key={`${entry.path}${entry.hash ?? ''}`}>
                <button
                  className={`search-result${i === selected ? ' selected' : ''}`}
                  onClick={() => go(entry)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="search-result-title">{entry.title}</span>
                  {entry.section && <span className="search-result-section">{entry.section}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query && results.length === 0 && (
          <div className="search-empty">
            No results for "{query}"
          </div>
        )}
      </div>
    </>
  );
}
