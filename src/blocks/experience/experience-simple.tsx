import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
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
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
        </Reveal>

        <ol className="border-border mt-12 border-l">
          {copy.items.map((item) => (
            <li key={item.id} className="relative pb-10 pl-8 last:pb-0">
              <span
                aria-hidden="true"
                className={`absolute top-2 -left-1.5 size-3 rounded-full ${
                  item.current ? 'bg-primary ring-primary/30 ring-4' : 'bg-border'
                }`}
              />
              <Reveal>
                <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  <span>{item.period}</span>
                  {item.current ? (
                    <span className="bg-primary text-primary-foreground rounded-full px-2 text-xs font-semibold">
                      {copy.currentLabel}
                    </span>
                  ) : null}
                  {item.kind === 'education' ? (
                    <span className="border-border rounded-full border px-2 text-xs">
                      {copy.educationLabel}
                    </span>
                  ) : null}
                </p>
                <h3 className="text-h3 mt-1 font-semibold">{item.position}</h3>
                <p className="text-primary mt-1 font-medium">{item.organization}</p>
                {item.description ? (
                  <p className="text-muted-foreground mt-3 text-pretty">{item.description}</p>
                ) : null}
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
