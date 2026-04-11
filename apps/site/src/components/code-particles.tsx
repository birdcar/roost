import { useEffect, useRef } from 'react'

const TOKENS = [
  'import', 'export', 'async', 'await', 'Model', 'Agent', 'Job',
  'Router', 'Pipeline', 'Session', 'Schema', 'Queue', 'deploy',
  'createServerFn', 'middleware', '@roost/orm', '@roost/ai',
  'D1', 'KV', 'R2', 'Workers', 'edge', 'query', 'migrate',
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  token: string
  opacity: number
  size: number
}

export function CodeParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      ctx!.scale(dpr, dpr)
    }

    resize()
    window.addEventListener('resize', resize)

    const rect = canvas.getBoundingClientRect()
    const count = Math.min(Math.floor(rect.width / 45), 30)
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.15 - 0.1,
      token: TOKENS[Math.floor(Math.random() * TOKENS.length)]!,
      opacity: 0.06 + Math.random() * 0.08,
      size: 11 + Math.random() * 4,
    }))

    const observer = new IntersectionObserver(
      ([entry]) => { pausedRef.current = !entry!.isIntersecting },
      { threshold: 0 },
    )
    observer.observe(canvas)

    function draw() {
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height

      ctx!.clearRect(0, 0, w, h)

      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy

        if (p.x < -100) p.x = w + 50
        if (p.x > w + 100) p.x = -50
        if (p.y < -30) p.y = h + 20
        if (p.y > h + 30) p.y = -20

        ctx!.font = `${p.size}px 'JetBrains Mono', 'Fira Code', monospace`
        ctx!.fillStyle = `rgba(191, 71, 34, ${p.opacity})`
        ctx!.fillText(p.token, p.x, p.y)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="code-particles"
      aria-hidden="true"
    />
  )
}
