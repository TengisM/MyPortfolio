import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { AboutCopy } from './copy'

export function AboutSimple({ copy, surface, anchorId, headingLevel }: BlockProps<AboutCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal>
          <EchoTitle as="p" text={copy.title} />
        </Reveal>

        <div className="mt-12 grid items-center gap-12 md:mt-20 md:grid-cols-12">
          <Reveal className="md:col-span-5">
            {/* Tilted like a photo on a desk; it straightens under the cursor. */}
            <img
              src={copy.image.src}
              alt={copy.image.alt}
              width={copy.image.width}
              height={copy.image.height}
              loading="lazy"
              className="mx-auto h-auto w-2/3 rotate-3 rounded-3xl object-cover transition-transform duration-500 hover:rotate-0 hover:scale-105 md:w-full"
            />
          </Reveal>
          <Reveal className="md:col-span-7" delay={0.1}>
            <H className="text-h2 font-bold text-balance">{copy.heading}</H>
            {copy.paragraphs.map((p) => (
              <p key={p} className="text-muted-foreground text-lead mt-5 text-pretty">
                {p}
              </p>
            ))}
            <dl className="border-border mt-10 grid grid-cols-3 gap-6 border-t pt-8">
              {copy.highlights.map((h) => (
                <div key={h.label} className="flex flex-col-reverse gap-1">
                  <dt className="text-muted-foreground text-sm">{h.label}</dt>
                  <dd className="text-primary font-display text-4xl font-black md:text-6xl">
                    {h.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
