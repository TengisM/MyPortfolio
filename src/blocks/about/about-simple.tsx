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
          <EchoTitle as={H} text={copy.heading} />
        </Reveal>

        <div className="mt-12 grid items-center gap-12 md:mt-16 md:grid-cols-12">
          <Reveal className="md:col-span-7">
            {copy.paragraphs.map((p) => (
              <p key={p} className="text-muted-foreground text-lead mt-5 text-pretty first:mt-0">
                {p}
              </p>
            ))}
            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {copy.facts.map((f) => (
                <li
                  key={f.text}
                  className="bg-muted border-border flex items-start gap-3 rounded-2xl border p-4 text-sm"
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    {f.icon}
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.1}>
            {/* Tilted like a print on a desk; it straightens under the cursor. */}
            <img
              src={copy.image.src}
              alt={copy.image.alt}
              width={copy.image.width}
              height={copy.image.height}
              loading="lazy"
              className="mx-auto h-auto w-2/3 rotate-3 rounded-3xl object-cover transition-transform duration-500 hover:rotate-0 hover:scale-105 md:w-full"
            />
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
