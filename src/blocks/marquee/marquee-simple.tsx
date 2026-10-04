import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import type { MarqueeCopy } from './copy'

// Two strips of poster type sliding in opposite directions. Each list is rendered twice so the
// loop seams at -50% (see `.marquee` in src/styles/portfolio.css).
export function MarqueeSimple({ copy, surface, anchorId, headingLevel }: BlockProps<MarqueeCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface} density="compact" className="overflow-hidden">
      <H className="sr-only">{copy.heading}</H>
      <ul className="sr-only">
        {[...copy.rows[0], ...copy.rows[1]].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div aria-hidden="true" className="font-display grid gap-2 font-black uppercase">
        {copy.rows.map((row, r) => (
          <div
            key={row[0]}
            className={`marquee text-6xl md:text-9xl ${r === 1 ? 'marquee-reverse' : ''}`}
          >
            {[0, 1].map((copyIndex) => (
              <span key={copyIndex} className="flex shrink-0 items-center">
                {row.map((t) => (
                  <span key={t} className="flex items-center">
                    <span className={r === 1 ? 'text-outline' : ''}>{t}</span>
                    <span className="text-primary mx-6 md:mx-10">✳</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}
