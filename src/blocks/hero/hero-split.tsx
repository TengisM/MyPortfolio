import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { FadeIn } from '@/motion'
import type { HeroCopy } from './copy'

// A personal intro: greeting and photo side by side, the way you'd introduce yourself.
export function HeroSplit({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid items-center gap-14 md:grid-cols-12">
          <FadeIn className="md:col-span-7">
            <div className="parallax-text">
              <p className="border-border text-muted-foreground inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium">
                <span aria-hidden="true" className="bg-primary size-2 rounded-full" />
                {copy.eyebrow}
              </p>
              <H className="font-display mt-6 text-5xl leading-none font-black text-balance md:text-7xl">
                {copy.heading}{' '}
                <span aria-hidden="true" className="wave">
                  👋
                </span>
              </H>
              <p className="text-muted-foreground mt-6 text-lg text-pretty">{copy.lead}</p>
              <p className="mt-4 flex items-center gap-2 text-sm font-medium">
                <span aria-hidden="true">📍</span>
                {copy.location}
              </p>

              <p className="sr-only">{copy.skillsLabel}</p>
              <ul className="mt-8 flex flex-wrap gap-2">
                {copy.skills.map((skill) => (
                  <li
                    key={skill}
                    className="bg-muted border-border hover:border-primary hover:text-primary rounded-full border px-3.5 py-1.5 text-sm transition-colors"
                  >
                    {skill}
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-wrap items-center gap-3">
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
                    className="text-muted-foreground hover:text-primary px-3 py-3.5 text-sm font-semibold transition-colors"
                  >
                    {s.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </FadeIn>

          {copy.image ? (
            // FadeIn, not Reveal: the photo must not wait on scroll. No fetchPriority="high": the
            // terminal is the first screen, so the photo shouldn't compete with its fonts.
            <FadeIn className="md:col-span-5" delay={0.15}>
              <div className="parallax-photo group relative mx-auto w-1/2 md:mr-0 md:w-3/4 lg:w-2/3">
                {/* A blue card peeking out behind the photo; they line up on hover. */}
                <div
                  aria-hidden="true"
                  className="bg-primary absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-4xl transition-transform duration-500 group-hover:translate-0 group-hover:rotate-0"
                />
                <img
                  src={copy.image.src}
                  srcSet={copy.image.srcSet}
                  sizes="(min-width: 768px) 340px, 45vw"
                  alt={copy.image.alt}
                  width={copy.image.width}
                  height={copy.image.height}
                  className="relative aspect-square w-full -rotate-2 rounded-4xl object-cover transition-transform duration-500 group-hover:rotate-0"
                />
              </div>
            </FadeIn>
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
