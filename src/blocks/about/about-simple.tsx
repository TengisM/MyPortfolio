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

        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-12">
          <Reveal className="md:col-span-7">
            {copy.paragraphs.map((p) => (
              <p key={p} className="text-muted-foreground mt-5 text-lg text-pretty first:mt-0">
                {p}
              </p>
            ))}
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.1}>
            <ul className="grid gap-3">
              {copy.facts.map((f) => (
                <li
                  key={f.text}
                  className="bg-muted border-border flex items-center gap-3 rounded-2xl border p-4 text-sm"
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    {f.icon}
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
