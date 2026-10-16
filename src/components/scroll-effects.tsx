import { useEffect } from 'react'

// Smooth (inertia) scrolling plus scroll-triggered reveals for the public pages. Mounted once in
// the root. Does nothing under /admin, where native scrolling suits the tables and sheets.
//
// Reveals are opt-in by CSS: elements carry `data-reveal`, but they only start hidden once this
// adds `js-reveal` to <html>. Without JavaScript, or before it runs, everything stays visible.
export function ScrollEffects() {
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return
    const root = document.documentElement
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    const reveal = (el: Element) => el.classList.add('is-in')

    // Anything already on screen is marked shown in the same frame the hiding class lands, so the
    // first view never flashes.
    const pending = new Set<Element>()
    const scan = () => {
      for (const el of document.querySelectorAll('[data-reveal]:not(.is-in)')) {
        if (pending.has(el)) continue
        if (reduce || el.getBoundingClientRect().top < innerHeight * 0.9) reveal(el)
        else {
          pending.add(el)
          io?.observe(el)
        }
      }
    }
    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue
                reveal(e.target)
                pending.delete(e.target)
                io?.unobserve(e.target)
              }
            },
            { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
          )
        : null
    scan()
    root.classList.add('js-reveal')
    // Safety net: at the very bottom, show whatever is left. The last section can be too short
    // to cross the observer's margin on a tall screen.
    const atBottom = () => {
      if (innerHeight + scrollY < root.scrollHeight - 4) return
      for (const el of pending) reveal(el)
      pending.clear()
    }
    addEventListener('scroll', atBottom, { passive: true })
    // Blocks are code-split and can mount after this runs; catch their elements too.
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true })

    let lenis: { destroy: () => void } | null = null
    let cancelled = false
    if (!reduce) {
      // Loaded on demand, so it never delays the first paint.
      import('lenis').then(({ default: Lenis }) => {
        if (cancelled) return
        lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.085 })
      })
    }

    return () => {
      cancelled = true
      removeEventListener('scroll', atBottom)
      io?.disconnect()
      mo.disconnect()
      lenis?.destroy()
      root.classList.remove('js-reveal')
    }
  }, [])
  return null
}
