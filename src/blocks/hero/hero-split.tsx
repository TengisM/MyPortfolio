import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { FadeIn } from '@/motion'
import type { HeroCopy } from './copy'

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
        <div className="grid items-center gap-12 md:grid-cols-5">
          <FadeIn className="md:col-span-3">
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              {copy.eyebrow}
            </p>
            <H className="mt-3 text-display font-bold text-balance">{copy.heading}</H>
            <p className="text-muted-foreground mt-5 text-lead text-pretty">{copy.lead}</p>
            <p className="text-muted-foreground mt-3 text-sm">{copy.location}</p>

            <p className="mt-8 text-sm font-semibold">{copy.skillsLabel}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {copy.skills.map((skill) => (
                <li
                  key={skill}
                  className="border-border bg-muted text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium"
                >
                  {skill}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={resolve(copy.primaryCta.target)}
                className="bg-primary text-primary-foreground rounded-base px-6 py-3 font-medium"
              >
                {copy.primaryCta.label}
              </a>
              <a
                href={copy.cv.href}
                download
                className="border-border hover:border-primary rounded-base border px-6 py-3 font-medium transition-colors"
              >
                {copy.cv.label}
              </a>
              {copy.socials.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary px-2 py-3 text-sm font-medium transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </FadeIn>
          {copy.image ? (
            // FadeIn, not Reveal: this image is the LCP element and must not wait on scroll.
            <FadeIn className="md:col-span-2">
              <img
                src={copy.image.src}
                alt={copy.image.alt}
                width={copy.image.width}
                height={copy.image.height}
                fetchPriority="high"
                className="ring-primary/40 mx-auto aspect-square w-3/4 rounded-full object-cover ring-4 md:w-full"
              />
            </FadeIn>
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
