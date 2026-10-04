import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ExperienceCopy } from './copy'

export function ExperienceSimple({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<ExperienceCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal>
          <EchoTitle as="p" text={copy.title} outline />
          <H className="text-h3 mt-6 font-bold">{copy.heading}</H>
          <p className="text-muted-foreground mt-2">{copy.lead}</p>
        </Reveal>

        <ol className="border-border mt-12 border-t">
          {copy.items.map((item) => (
            <li key={item.id} className="border-border border-b">
              <Reveal>
                {/* A lime band sweeps in from the left on hover and the text flips to ink. */}
                <div className="group hover:text-primary-foreground relative isolate grid gap-3 py-8 transition-colors duration-300 before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-primary before:transition-transform before:duration-500 hover:before:scale-x-100 md:grid-cols-12 md:gap-8 md:px-4">
                  <p className="font-display text-outline group-hover:text-primary-foreground text-5xl font-black md:col-span-3 md:text-7xl">
                    {item.year}
                  </p>
                  <div className="md:col-span-5">
                    <p className="text-muted-foreground group-hover:text-primary-foreground flex flex-wrap items-center gap-2 text-sm">
                      <span>{item.period}</span>
                      {item.current ? (
                        <span className="bg-primary text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary rounded-full px-2.5 text-xs font-bold">
                          {copy.currentLabel}
                        </span>
                      ) : null}
                      {item.kind === 'education' ? (
                        <span className="border-current rounded-full border px-2.5 text-xs">
                          {copy.educationLabel}
                        </span>
                      ) : null}
                    </p>
                    <h3 className="text-h3 mt-2 font-bold">{item.position}</h3>
                    <p className="text-primary group-hover:text-primary-foreground mt-1 font-semibold">
                      {item.organization}
                    </p>
                  </div>
                  {item.description ? (
                    <p className="text-muted-foreground group-hover:text-primary-foreground text-sm text-pretty md:col-span-4">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
