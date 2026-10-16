import { useEffect } from 'react'

// The API runs on Render's free plan, which sleeps after 15 idle minutes and takes 30-60 s to
// wake. The first touch, key or scroll pings it, so it is usually up by the time the visitor sends
// the contact form or opens `tron online`.
//
// On interaction, not on load: a page load alone (a crawler, Lighthouse) never wakes it, and a
// slow wake can't hold up the load event.
export function WakeApi() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    const wake = () => {
      for (const e of events) removeEventListener(e, wake)
      fetch('/api/health', { cache: 'no-store' }).catch(() => {})
    }
    for (const e of events) addEventListener(e, wake, { passive: true })
    return () => {
      for (const e of events) removeEventListener(e, wake)
    }
  }, [])
  return null
}
