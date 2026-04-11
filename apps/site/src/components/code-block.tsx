import { useState, type ReactNode } from 'react';

function dedent(str: string): string {
  const lines = str.split('\n');
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  const indents = lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^(\s*)/)?.[1]?.length ?? 0);
  const minIndent = Math.min(...indents);
  if (minIndent === 0) return lines.join('\n');
  return lines.map((l) => l.slice(minIndent)).join('\n');
}

function highlightLine(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  let remaining = line;
  let key = 0;

  const patterns: Array<{ re: RegExp; cls: string }> = [
    { re: /^(\/\/.*)/, cls: 'tok-comment' },
    { re: /^('[^']*'|"[^"]*"|`[^`]*`)/, cls: 'tok-string' },
    {
      re: /^(import|export|from|const|let|var|function|async|await|return|if|else|for|of|in|while|new|typeof|type|interface|class|extends|implements|abstract|static|readonly|private|public|protected|default|switch|case|break|continue|throw|try|catch|finally|void|null|undefined|true|false|this|super|as|is|keyof|declare|namespace|module|enum)\b/,
      cls: 'tok-keyword',
    },
    { re: /^(\d+\.?\d*)/, cls: 'tok-number' },
    { re: /^([A-Z][a-zA-Z0-9_]*(?:<[^>]*>)?)/, cls: 'tok-type' },
    { re: /^([a-z_$][a-zA-Z0-9_]*)\s*(?=\()/, cls: 'tok-function' },
    { re: /^(=>|===|!==|==|!=|<=|>=|\?\?|&&|\|\||\.\.\.|\+\+|--|[+\-*/=<>!?&|:])/, cls: 'tok-operator' },
    { re: /^(\.)([a-zA-Z_$][a-zA-Z0-9_]*)/, cls: 'tok-punctuation' },
    { re: /^([{}()\[\];,])/, cls: 'tok-punctuation' },
    { re: /^(\s+)/, cls: '' },
    { re: /^([a-z_$][a-zA-Z0-9_]*)/, cls: '' },
    { re: /^(.)/, cls: '' },
  ];

  while (remaining.length > 0) {
    let matched = false;
    for (const { re, cls } of patterns) {
      const m = remaining.match(re);
      if (m) {
        if (cls === 'tok-punctuation' && m[2]) {
          tokens.push(<span key={key++} className="tok-punctuation">.</span>);
          tokens.push(<span key={key++} className="tok-property">{m[2]}</span>);
          remaining = remaining.slice(m[0].length);
        } else if (cls) {
          tokens.push(<span key={key++} className={cls}>{m[1] ?? m[0]}</span>);
          remaining = remaining.slice((m[1] ?? m[0]).length);
        } else {
          tokens.push(<span key={key++}>{m[1] ?? m[0]}</span>);
          remaining = remaining.slice((m[1] ?? m[0]).length);
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push(<span key={key++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

function highlightCode(code: string): ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, i) => (
    <span key={i}>
      {highlightLine(line)}
      {i < lines.length - 1 ? '\n' : ''}
    </span>
  ));
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      className={`copy-btn${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function CodeBlock({
  children,
  title,
}: {
  children: string;
  title?: string;
}) {
  const code = dedent(children);

  return (
    <div className="code-block">
      <div className="code-block-header">
        {title && <span className="code-block-title">{title}</span>}
        {!title && <span />}
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{highlightCode(code)}</code>
      </pre>
    </div>
  );
}
