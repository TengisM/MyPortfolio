import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { FadeIn } from '@/motion'
import type { HeroCopy } from './copy'

const PROMPT = 'text-primary select-none'
const FILE_LINK = 'text-primary underline-offset-4 hover:underline'

// The intro as a terminal session. Every line is real text in the HTML (the name is the page's
// h1); `.term` in src/styles/portfolio.css plays it back as typing on load.
export function HeroSplit({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  const [github, linkedin] = copy.socials
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid items-center gap-12 md:grid-cols-12">
          <FadeIn className="min-w-0 md:col-span-8">
            <div className="border-border bg-muted/80 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur">
              <div className="border-border flex items-center gap-2 border-b px-4 py-3">
                <span aria-hidden="true" className="size-3 rounded-full bg-red-400/80" />
                <span aria-hidden="true" className="size-3 rounded-full bg-amber-400/80" />
                <span aria-hidden="true" className="size-3 rounded-full bg-green-400/80" />
                <span className="text-muted-foreground ml-3 truncate font-mono text-xs">
                  {copy.terminalTitle}
                </span>
              </div>

              <div className="term grid gap-1.5 p-5 font-mono text-sm md:p-7 md:text-base">
                <p className="cmd">
                  <span className={PROMPT}>$ </span>whoami
                </p>
                <H className="out font-display mb-2 text-4xl leading-tight font-black md:text-6xl">
                  {copy.heading}
                </H>
                <p className="cmd">
                  <span className={PROMPT}>$ </span>cat about.txt
                </p>
                <p className="out text-muted-foreground mb-2">
                  <span className="text-foreground font-semibold">{copy.role}.</span> {copy.lead}
                </p>
                <p className="cmd">
                  <span className={PROMPT}>$ </span>cat location.txt
                </p>
                <p className="out text-muted-foreground mb-2">{copy.location}</p>
                <p className="cmd">
                  <span className={PROMPT}>$ </span>ls ./links
                </p>
                <p className="out mb-2 flex flex-wrap gap-x-6 gap-y-1">
                  {github ? (
                    <a
                      href={github.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={FILE_LINK}
                    >
                      {copy.linkNames.github}
                    </a>
                  ) : null}
                  {linkedin ? (
                    <a
                      href={linkedin.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={FILE_LINK}
                    >
                      {copy.linkNames.linkedin}
                    </a>
                  ) : null}
                  <a href={copy.cv.href} download className={FILE_LINK}>
                    {copy.linkNames.cv}
                  </a>
                  <a href={resolve(copy.primaryCta.target)} className={FILE_LINK}>
                    {copy.linkNames.contact}
                  </a>
                </p>
                <p className="prompt-end">
                  <span className={PROMPT}>$ </span>
                  <span aria-hidden="true" className="caret" />
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
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
            </div>
          </FadeIn>

          {copy.image ? (
            // FadeIn, not Reveal: this image is the LCP element and must not wait on scroll.
            <FadeIn className="md:col-span-4" delay={0.15}>
              <div className="parallax-photo group relative mx-auto w-1/2 md:w-full">
                {/* A blue card peeking out behind the photo; they line up on hover. */}
                <div
                  aria-hidden="true"
                  className="bg-primary absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-4xl transition-transform duration-500 group-hover:translate-0 group-hover:rotate-0"
                />
                <img
                  src={copy.image.src}
                  alt={copy.image.alt}
                  width={copy.image.width}
                  height={copy.image.height}
                  fetchPriority="high"
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
