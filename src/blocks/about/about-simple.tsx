import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { AboutCopy } from './copy'

export function AboutSimple({ copy, surface, anchorId, headingLevel }: BlockProps<AboutCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid items-center gap-12 md:grid-cols-5">
          <Reveal className="md:col-span-3">
            <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
            {copy.paragraphs.map((p) => (
              <p key={p} className="text-muted-foreground text-lead mt-5 text-pretty">
                {p}
              </p>
            ))}
            <dl className="mt-10 grid grid-cols-3 gap-6">
              {copy.highlights.map((h) => (
                <div key={h.label} className="flex flex-col-reverse">
                  <dt className="text-muted-foreground text-sm">{h.label}</dt>
                  <dd className="text-primary font-display text-h2 font-bold">{h.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.1}>
            <img
              src={copy.image.src}
              alt={copy.image.alt}
              width={copy.image.width}
              height={copy.image.height}
              loading="lazy"
              className="rounded-base mx-auto h-auto w-2/3 object-cover md:w-full"
            />
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
