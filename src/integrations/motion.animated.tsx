import type { ReactNode } from 'react'
import type { MotionModule } from '@/integrations/motion.types'

type Props = { children: ReactNode; className?: string; delay?: number }

// All CSS, no animation library: the `motion` package cost 40 KB gzipped for one hero fade.
// The delay maps to a tenth-of-a-second step, the same steps as Reveal.

// Transform only, never opacity. An opacity of 0 gets written into the static HTML, so visitors
// without JS would see a blank hero. It plays when the site view appears (see [data-fade-in] in
// src/styles/portfolio.css), so it isn't spent behind the terminal.
export function FadeIn({ children, className, delay = 0 }: Props) {
  return (
    <div className={className} data-fade-in="" data-fade-step={Math.min(Math.round(delay * 10), 4)}>
      {children}
    </div>
  )
}

// CSS-driven, not motion: the element only starts hidden once ScrollEffects puts `js-reveal` on
// <html>, so the static HTML never carries `opacity:0` and works without JavaScript. The delay
// maps to a tenth-of-a-second step (see [data-reveal-step] in src/styles/portfolio.css).
export function Reveal({ children, className, delay = 0 }: Props) {
  return (
    <div
      className={className}
      data-reveal=""
      data-reveal-step={Math.min(Math.round(delay * 10), 4)}
    >
      {children}
    </div>
  )
}

// Kept for the MotionModule contract. Nothing staggers today, so it is a plain wrapper.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

// Checks every export against the shared type. Callers only check what they import.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
