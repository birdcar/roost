import type { ReactNode } from 'react';

const labels: Record<string, string> = {
  tip: 'Tip',
  warning: 'Warning',
  note: 'Note',
};

export function Callout({
  type = 'note',
  children,
}: {
  type?: 'tip' | 'warning' | 'note';
  children: ReactNode;
}) {
  return (
    <div className={`callout callout-${type}`}>
      <div className="callout-label">{labels[type]}</div>
      {typeof children === 'string' ? <p>{children}</p> : children}
    </div>
  );
}
