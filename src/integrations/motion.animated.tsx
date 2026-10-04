import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import type { MotionModule } from '@/integrations/motion.types'

type Props = { children: ReactNode; className?: string; delay?: number }

// The server always renders the animated branch. Reading the OS setting during hydration would
// mismatch and freeze the element at `initial`, so switch only after mount.
function useReducedMotionAfterMount() {
  const reduce = useReducedMotion()
  const [committed, setCommitted] = useState(false)
  useEffect(() => {
    if (reduce) setCommitted(true)
  }, [reduce])
  return committed
}

// Transform only, never opacity. An opacity of 0 gets written into the static HTML, so visitors
// without JS would see a blank hero.
export function FadeIn({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// A plain wrapper. Sections don't animate in: the one moving moment on the page is the script
// in the rail. Kept as a component so blocks keep a single motion import.
export function Reveal({ children, className }: Props) {
  return <div className={className}>{children}</div>
}

// No opacity in `hidden`/`shown` here or in child variants.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  )
}

// Checks every export against the shared type. Callers only check what they import.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
