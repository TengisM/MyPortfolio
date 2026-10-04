import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import type { ExperienceCopy } from './copy'

// A plain record, newest first. The years are the one real sequence on the page, so they lead
// each row; the current role's dates are in blue.
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
        <div className="border-border grid gap-6 border-t pt-8 md:grid-cols-12">
          <H className="text-2xl font-semibold md:col-span-3">{copy.heading}</H>
          <ol className="md:col-span-9">
            {copy.items.map((item) => (
              <li
                key={item.id}
                className="border-border grid gap-2 border-b py-6 first:pt-0 last:border-b-0 md:grid-cols-9 md:gap-6"
              >
                <p
                  className={`tabular text-sm md:col-span-2 md:pt-1 ${
                    item.current ? 'text-primary font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {item.period}
                </p>
                <div className="md:col-span-7">
                  <h3 className="text-lg font-semibold">
                    {item.position}
                    <span className="text-muted-foreground font-normal">, {item.organization}</span>
                  </h3>
                  {item.description ? (
                    <p className="text-muted-foreground mt-2 leading-relaxed text-pretty">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  )
}
