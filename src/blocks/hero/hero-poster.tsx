import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { RiseText } from '@/components/type/rise-text'
import type { BlockProps } from '@/lib/types'
import { FadeIn } from '@/motion'
import type { HeroCopy } from './copy'

// 24 tiles on wide screens, 12 on phones. The ones past 12 hide below md.
const TILES = Array.from({ length: 24 }, (_, i) => i)

export function HeroPoster({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface} className="relative isolate overflow-hidden">
      {/* The tile wall behind the name. Each tile lights up under the cursor and fades back. */}
      <div className="tiles absolute inset-2 -z-10 grid grid-cols-3 grid-rows-4 gap-2 md:grid-cols-6">
        {TILES.map((i) => (
          <div
            key={i}
            className={`bg-muted border-border/40 hover:bg-primary/20 rounded-2xl border transition-colors duration-1000 hover:duration-100 ${
              i >= 12 ? 'max-md:hidden' : ''
            }`}
          />
        ))}
      </div>

      {/* Lets the pointer reach the tiles. Links and buttons opt back in. */}
      <Container className="pointer-events-none relative">
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs font-medium tracking-widest uppercase md:text-sm">
          <span>{copy.eyebrow}</span>
          <span>{copy.location}</span>
        </div>

        <H className="font-display text-mega mt-8 font-black uppercase md:mt-12">
          <span className="sr-only">{copy.heading}</span>
          <RiseText text={copy.mega} />
        </H>

        <p className="font-hand text-primary mt-2 -rotate-2 text-4xl md:text-6xl">{copy.tagline}</p>

        <FadeIn delay={0.6}>
          <p className="text-muted-foreground text-lead mt-8 text-pretty md:w-1/2">{copy.lead}</p>
          <div className="pointer-events-auto mt-10 flex flex-wrap items-center gap-3">
            <a
              href={resolve(copy.primaryCta.target)}
              className="bg-primary text-primary-foreground rounded-full px-7 py-3.5 font-semibold transition-transform hover:-translate-y-0.5"
            >
              {copy.primaryCta.label}
            </a>
            <a
              href={copy.cv.href}
              download
              className="border-foreground/30 hover:border-primary hover:text-primary rounded-full border px-7 py-3.5 font-semibold transition-colors"
            >
              {copy.cv.label}
            </a>
            {copy.socials.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary px-3 py-3.5 text-sm font-semibold tracking-wide uppercase transition-colors"
              >
                {s.label} ↗
              </a>
            ))}
          </div>
        </FadeIn>

        {/* Rotating "scroll down" badge, Junni-style. The ring spins, the arrow stays put. */}
        <a
          href={resolve('about')}
          className="pointer-events-auto absolute right-0 bottom-0 hidden size-32 items-center justify-center md:flex"
        >
          <svg viewBox="0 0 100 100" className="spin-slow absolute inset-0" aria-hidden="true">
            <defs>
              <path id="scroll-ring" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
            </defs>
            <text className="fill-current text-xs font-semibold tracking-widest">
              <textPath href="#scroll-ring">{copy.scrollLabel}</textPath>
            </text>
          </svg>
          <span className="text-primary text-2xl" aria-hidden="true">
            ↓
          </span>
          <span className="sr-only">{copy.scrollLabel.split('·')[0]?.trim()}</span>
        </a>
      </Container>
    </Section>
  )
}
