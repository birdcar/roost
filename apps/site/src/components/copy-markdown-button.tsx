import { useState } from 'react'

export function CopyMarkdownButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleClick() {
    try {
      const res = await fetch(`${path}.md`)
      if (!res.ok) throw new Error('fetch failed')
      await navigator.clipboard.writeText(await res.text())
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button onClick={handleClick} aria-label="Copy page as Markdown">
      {state === 'copied' ? 'Copied!' : state === 'error' ? 'Error' : 'Copy as Markdown'}
    </button>
  )
}
