import { useEffect } from 'react'

// Smooth (inertia) scrolling for the public pages. Skipped under /admin, where native scrolling
// suits the tables and sheets, and for visitors who prefer reduced motion.
export function ScrollEffects() {
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let lenis: { destroy: () => void } | null = null
    let cancelled = false
    // Loaded on demand, so it never delays the first paint.
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return
      lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.1 })
    })
    return () => {
      cancelled = true
      lenis?.destroy()
    }
  }, [])
  return null
}
