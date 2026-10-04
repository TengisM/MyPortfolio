import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import type { AboutCopy } from './copy'

export function AboutSimple({ copy, surface, anchorId, headingLevel }: BlockProps<AboutCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="border-border grid gap-6 border-t pt-8 md:grid-cols-12">
          <H className="text-2xl font-semibold md:col-span-3">{copy.heading}</H>
          <div className="md:col-span-8">
            {copy.paragraphs.map((p, i) => (
              <p
                key={p}
                className={
                  i === 0
                    ? 'font-stretch-semi-condensed text-2xl leading-snug font-medium text-pretty md:text-3xl'
                    : 'text-muted-foreground mt-5 text-lg leading-relaxed text-pretty'
                }
              >
                {p}
              </p>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
